"""Coleta reiniciável de contratações por data de publicação do PNCP."""

import argparse
import ctypes
import datetime as dt
import email.utils
import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import math
import os
from pathlib import Path
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
BASE = 'https://pncp.gov.br'
PAGE_SIZE = 50
BRAZIL = dt.timezone(dt.timedelta(hours=-3))
LOG = logging.getLogger('pncp')


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def connect(path):
    db = sqlite3.connect(path, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('PRAGMA synchronous=FULL')
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript('''
        CREATE TABLE IF NOT EXISTS contratacoes (
            numero_controle TEXT PRIMARY KEY, data_publicacao TEXT,
            data_atualizacao TEXT, modalidade INTEGER, objeto TEXT,
            dados_json TEXT NOT NULL, coletado_em TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tarefas (
            dia TEXT NOT NULL, modalidade INTEGER NOT NULL, concluida INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (dia, modalidade)
        );
        CREATE TABLE IF NOT EXISTS rodadas (
            id INTEGER PRIMARY KEY AUTOINCREMENT, dia TEXT NOT NULL, modalidade INTEGER NOT NULL,
            estado TEXT NOT NULL DEFAULT 'em_andamento', total_registros INTEGER,
            total_paginas INTEGER, proxima_pagina INTEGER NOT NULL DEFAULT 1,
            digest TEXT, iniciada_em TEXT NOT NULL, encerrada_em TEXT,
            FOREIGN KEY (dia, modalidade) REFERENCES tarefas(dia, modalidade)
        );
        CREATE INDEX IF NOT EXISTS rodadas_tarefa ON rodadas(dia, modalidade, id);
        CREATE TABLE IF NOT EXISTS observacoes (
            rodada INTEGER NOT NULL, numero_controle TEXT NOT NULL, hash TEXT NOT NULL,
            PRIMARY KEY (rodada, numero_controle), FOREIGN KEY (rodada) REFERENCES rodadas(id)
        );
        CREATE TABLE IF NOT EXISTS paginas (
            rodada INTEGER NOT NULL, pagina INTEGER NOT NULL, registros INTEGER NOT NULL,
            concluida_em TEXT NOT NULL, PRIMARY KEY (rodada, pagina),
            FOREIGN KEY (rodada) REFERENCES rodadas(id)
        );
        CREATE TABLE IF NOT EXISTS controle (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    ''')
    db.commit()
    return db


def setting(db, key, default):
    row = db.execute('SELECT valor FROM controle WHERE chave=?', (key,)).fetchone()
    return row['valor'] if row else default


def set_setting(db, key, value):
    db.execute('INSERT INTO controle VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor', (key, str(value)))


def retry_after(value):
    if not value:
        return 0.0
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            when = email.utils.parsedate_to_datetime(value)
            return max(0.0, when.timestamp() - time.time())
        except (TypeError, ValueError, OverflowError):
            return 0.0


class Client:
    def __init__(self, db):
        self.db = db
        self.delay = float(setting(db, 'intervalo', '0.5'))

    def get(self, path, params=None):
        url = BASE + path + (('?' + urllib.parse.urlencode(params)) if params else '')
        while True:
            wait = float(setting(self.db, 'proxima_requisicao', '0')) - time.time()
            if wait > 0:
                time.sleep(min(wait, 60))
                continue
            try:
                request = urllib.request.Request(url, headers={'Accept': 'application/json', 'User-Agent': 'ColetorPNCP/1.0'})
                with urllib.request.urlopen(request, timeout=60) as response:
                    status = response.status
                    result = None if status == 204 else json.load(response)
                self.delay = max(0.5, self.delay - 0.5)
                with self.db:
                    set_setting(self.db, 'intervalo', self.delay)
                    set_setting(self.db, 'proxima_requisicao', time.time() + self.delay)
                return result
            except urllib.error.HTTPError as error:
                server_wait = retry_after(error.headers.get('Retry-After'))
                if error.code in (408, 425, 429) or 500 <= error.code < 600:
                    self.delay = min(300, self.delay + 5)
                    wait = max(self.delay, server_wait)
                else:
                    # Erros de configuração precisam de atenção; não avançar nem pressionar o servidor.
                    wait = max(900, server_wait)
                LOG.warning('HTTP %s em %s; nova tentativa em %.0f s', error.code, path, wait)
            except (OSError, ValueError, json.JSONDecodeError) as error:
                self.delay = min(300, self.delay + 5)
                wait = self.delay
                LOG.warning('Falha de rede ou resposta inválida em %s: %s; tentativa em %.0f s', path, error, wait)
            with self.db:
                set_setting(self.db, 'intervalo', self.delay)
                set_setting(self.db, 'proxima_requisicao', time.time() + wait)


def get_modalities(client):
    while True:
        data = client.get('/api/pncp/v1/modalidades')
        if isinstance(data, list) and data and all(isinstance(x, dict) and isinstance(x.get('id'), int) for x in data):
            return sorted({x['id'] for x in data})
        LOG.error('Lista de modalidades inválida; tentando novamente em 60 s')
        time.sleep(60)


def start_round(db, day, modality):
    row = db.execute("SELECT * FROM rodadas WHERE dia=? AND modalidade=? AND estado='em_andamento' ORDER BY id DESC LIMIT 1", (day, modality)).fetchone()
    if row:
        return row
    with db:
        cur = db.execute('INSERT INTO rodadas(dia, modalidade, iniciada_em) VALUES (?, ?, ?)', (day, modality, utc_now()))
    return db.execute('SELECT * FROM rodadas WHERE id=?', (cur.lastrowid,)).fetchone()


def invalidate(db, round_id, reason):
    with db:
        db.execute("UPDATE rodadas SET estado='inconsistente', encerrada_em=? WHERE id=?", (utc_now(), round_id))
    LOG.warning('Rodada %s inconsistente: %s. Reiniciando a modalidade.', round_id, reason)


def parse_page(payload, page):
    if payload is None:
        if page != 1:
            raise ValueError('página adicional vazia')
        return 0, 0, []
    if not isinstance(payload, dict) or not isinstance(payload.get('data'), list):
        raise ValueError('estrutura de resposta inválida')
    count, pages, received = payload.get('totalRegistros'), payload.get('totalPaginas'), payload.get('numeroPagina')
    if any(type(x) is not int for x in (count, pages, received)) or count < 0 or pages != math.ceil(count / PAGE_SIZE) or received != page:
        raise ValueError('metadados de paginação inválidos')
    records = payload['data']
    if len(records) != min(PAGE_SIZE, max(0, count - (page - 1) * PAGE_SIZE)):
        raise ValueError('quantidade da página divergente')
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get('numeroControlePNCP'), str) or not record['numeroControlePNCP'].strip():
            raise ValueError('registro sem número de controle PNCP')
    return count, pages, records


def save_page(db, round_id, page, count, pages, records):
    with db:
        for record in records:
            raw = canonical(record)
            key = record['numeroControlePNCP']
            digest = hashlib.sha256(raw.encode('utf-8')).hexdigest()
            db.execute('''INSERT INTO contratacoes VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(numero_controle) DO UPDATE SET data_publicacao=excluded.data_publicacao,
                data_atualizacao=excluded.data_atualizacao, modalidade=excluded.modalidade,
                objeto=excluded.objeto, dados_json=excluded.dados_json, coletado_em=excluded.coletado_em''',
                (key, record.get('dataPublicacaoPncp'), record.get('dataAtualizacao'), record.get('modalidadeId'), record.get('objetoCompra'), raw, utc_now()))
            # Duplicação entre páginas indica paginação instável, portanto invalida a rodada.
            db.execute('INSERT INTO observacoes VALUES (?, ?, ?)', (round_id, key, digest))
        db.execute('INSERT INTO paginas VALUES (?, ?, ?, ?)', (round_id, page, len(records), utc_now()))
        db.execute('UPDATE rodadas SET total_registros=?, total_paginas=?, proxima_pagina=? WHERE id=?', (count, pages, page + 1, round_id))
    LOG.info('Rodada %s: página %s/%s salva (%s registros; total informado %s)', round_id, page, max(1, pages), len(records), count)


def finish_round(db, round_id):
    row = db.execute('SELECT * FROM rodadas WHERE id=?', (round_id,)).fetchone()
    observed = db.execute('SELECT numero_controle, hash FROM observacoes WHERE rodada=? ORDER BY numero_controle', (round_id,)).fetchall()
    page_count = db.execute('SELECT COUNT(*) FROM paginas WHERE rodada=?', (round_id,)).fetchone()[0]
    if len(observed) != row['total_registros'] or page_count != max(1, row['total_paginas']):
        invalidate(db, round_id, 'contagem ou páginas divergentes')
        return
    digest = hashlib.sha256(canonical([(r['numero_controle'], r['hash']) for r in observed]).encode('utf-8')).hexdigest()
    previous = db.execute("SELECT digest FROM rodadas WHERE dia=? AND modalidade=? AND estado='concluida' AND id<? ORDER BY id DESC LIMIT 1", (row['dia'], row['modalidade'], round_id)).fetchone()
    with db:
        db.execute("UPDATE rodadas SET estado='concluida', digest=?, encerrada_em=? WHERE id=?", (digest, utc_now(), round_id))
        if previous and previous['digest'] == digest:
            db.execute('UPDATE tarefas SET concluida=1 WHERE dia=? AND modalidade=?', (row['dia'], row['modalidade']))
    LOG.info('Rodada %s concluída: %s registros; %s', round_id, len(observed), 'modalidade confirmada' if previous and previous['digest'] == digest else 'nova verificação necessária')


def process_task(db, client, day, modality):
    while not db.execute('SELECT concluida FROM tarefas WHERE dia=? AND modalidade=?', (day, modality)).fetchone()[0]:
        row = start_round(db, day, modality)
        page = row['proxima_pagina']
        if row['total_paginas'] is not None and page > max(1, row['total_paginas']):
            finish_round(db, row['id'])
            continue
        compact = day.replace('-', '')
        payload = client.get('/api/consulta/v1/contratacoes/publicacao', dict(dataInicial=compact, dataFinal=compact, codigoModalidadeContratacao=modality, pagina=page, tamanhoPagina=PAGE_SIZE))
        try:
            count, pages, records = parse_page(payload, page)
            if row['total_registros'] is not None and (count != row['total_registros'] or pages != row['total_paginas']):
                raise ValueError('totais mudaram durante a paginação')
            save_page(db, row['id'], page, count, pages, records)
        except (ValueError, sqlite3.IntegrityError) as error:
            invalidate(db, row['id'], str(error))
            time.sleep(5)


def work(db, client, first, last):
    day = first
    while day <= last:
        if day >= dt.datetime.now(BRAZIL).date():
            LOG.info('Aguardando o encerramento do dia %s no horário de Brasília', day)
            time.sleep(1800)
            continue
        text = day.isoformat()
        modalities = get_modalities(client)
        with db:
            db.executemany('INSERT OR IGNORE INTO tarefas(dia, modalidade) VALUES (?, ?)', [(text, m) for m in modalities])
        # Também retoma modalidades anteriormente cadastradas que deixaram de constar na lista.
        tasks = db.execute('SELECT modalidade FROM tarefas WHERE dia=? AND concluida=0 ORDER BY modalidade', (text,)).fetchall()
        if tasks:
            LOG.info('Dia %s: %s modalidades pendentes', text, len(tasks))
        for task in tasks:
            process_task(db, client, text, task['modalidade'])
        LOG.info('Dia %s concluído para todas as modalidades verificadas', text)
        day += dt.timedelta(days=1)
    return


def acquire_lock(path):
    lock = open(path, 'a+b')
    lock.seek(0, os.SEEK_END)
    if lock.tell() == 0:
        lock.write(b'0')
        lock.flush()
    lock.seek(0)
    try:
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        lock.close()
        raise RuntimeError('Outro coletor já está usando este banco de dados.')
    return lock


def prevent_sleep():
    """Impede a suspensão automática enquanto a thread principal estiver ativa."""
    if os.name != 'nt':
        LOG.warning('A prevenção de suspensão está disponível somente no Windows.')
        return None
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    state = kernel.SetThreadExecutionState
    state.argtypes = [ctypes.c_uint32]
    state.restype = ctypes.c_uint32
    if not state(0x80000000 | 0x00000001):  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
        raise ctypes.WinError(ctypes.get_last_error())
    LOG.info('Prevenção de suspensão automática do Windows ativada durante a execução.')
    return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inicio', type=dt.date.fromisoformat, default=dt.date(2026, 10, 1))
    parser.add_argument('--fim', type=dt.date.fromisoformat, default=dt.date(2026, 11, 7))
    parser.add_argument('--banco', type=Path, default=ROOT / 'pncp.sqlite3')
    parser.add_argument('--log', type=Path, default=ROOT / 'coletor_pncp.log')
    args = parser.parse_args()
    if args.inicio > args.fim:
        parser.error('A data inicial deve ser anterior ou igual à final.')
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', handlers=[logging.StreamHandler(), RotatingFileHandler(args.log, maxBytes=10_000_000, backupCount=5, encoding='utf-8')])
    lock = acquire_lock(str(args.banco.resolve()) + '.lock')
    db = connect(args.banco)
    client = Client(db)
    LOG.info('Coletor iniciado: %s até %s; banco %s', args.inicio, args.fim, args.banco)
    sleep_state = None
    try:
        sleep_state = prevent_sleep()
        while True:
            try:
                work(db, client, args.inicio, args.fim)
                LOG.info('Intervalo concluído; monitorando o estado a cada hora.')
                time.sleep(3600)
            except (sqlite3.Error, OSError, ValueError) as error:
                LOG.exception('Erro no ciclo; retomada a partir do banco em 60 s: %s', error)
                time.sleep(60)
    except KeyboardInterrupt:
        LOG.info('Interrupção solicitada. O progresso salvo será retomado na próxima execução.')
    finally:
        if sleep_state:
            if not sleep_state(0x80000000):  # ES_CONTINUOUS, sem ES_SYSTEM_REQUIRED
                LOG.error('Não foi possível liberar o bloqueio de suspensão automática.')
            else:
                LOG.info('Prevenção de suspensão automática liberada.')
        db.close()
        lock.close()


if __name__ == '__main__':
    main()
