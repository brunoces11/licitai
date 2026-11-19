"""Executa o coletor do PNCP para os dias 8 a 18 de novembro de 2026."""

import sys
from pathlib import Path

from coletor_pncp import main


if __name__ == '__main__':
    raiz = Path(__file__).resolve().parent
    sys.argv = [
        sys.argv[0],
        '--inicio', '2026-11-08',
        '--fim', '2026-11-18',
        '--banco', str(raiz / 'pncp_recentes.sqlite3'),
        '--log', str(raiz / 'coletor_pncp_recentes.log'),
    ]
    main()
