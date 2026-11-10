#!/usr/bin/env python3
"""VLUX Loyalty V0.4.5 · Modelo reproducible de costos y escalabilidad.

Uso:  python3 scripts/costos-v045.py            → imprime tablas Markdown
      python3 scripts/costos-v045.py --csv out/  → además escribe CSV (abre en Excel / Google Sheets)

Todo lo que no es precio oficial es una SUPOSICIÓN y está en SUPUESTOS. Cambia un valor y vuelve a correr:
el modelo es deliberadamente simple (aritmética visible) para poder auditarlo. Precios oficiales leídos el
2026-11-06 (ver docs/V045_COSTOS_ESCALABILIDAD.md, sección Fuentes). No incluye impuestos ni comisiones de cobro.
"""
import csv
import math
import os
import sys

# ---------------------------------------------------------------- precios oficiales (USD, 2026-11-06)
PRECIOS = {
    'supabase_pro_base': 25.0,          # incluye 10 USD de crédito de cómputo (cubre Micro)
    'supabase_compute': {'micro': 10.0, 'small': 15.0, 'medium': 60.0, 'large': 110.0},
    'supabase_disk_incl_gb': 8.0, 'supabase_disk_usd_gb': 0.125,
    'supabase_egress_incl_gb': 250.0, 'supabase_egress_usd_gb': 0.09,
    'vercel_pro_seat': 20.0,            # incluye 20 USD de crédito de uso
    'vercel_cpu_usd_h': 0.128, 'vercel_mem_usd_gbh': 0.0106, 'vercel_inv_usd_m': 0.60,
    'resend_free_month': 3000, 'resend_free_day': 100, 'resend_pro': 20.0,
}

# ---------------------------------------------------------------- supuestos (editables)
SUPUESTOS = {
    'tipo_cambio_mxn_usd': 18.5,        # HIPÓTESIS: verificar el día de la decisión (sensibilidad 17–21)
    'asientos_vercel': 1,
    # Actividad por cliente al mes (operaciones registradas en caja)
    'ops_cliente_mes': {'baja': 1.0, 'media': 3.0, 'alta': 8.0},
    # Solicitudes HTTP a funciones por operación: caja (buscar/escanear, ver tarjeta, registrar, refrescar) + cliente
    'req_por_op': 9,
    # Minutos al día con el panel del dueño abierto (sondeo cada 8 s → 7.5 req/min) y la caja abierta (≈2 req/min)
    'panel_min_dia': {'baja': 10, 'media': 30, 'alta': 90},
    'caja_min_dia': {'baja': 120, 'media': 300, 'alta': 480},
    'panel_req_min': 7.5, 'caja_req_min': 2.0,
    # Cómputo por solicitud (Vercel cobra CPU activa; la espera de la BD no cuenta como CPU pero sí como memoria)
    'cpu_ms_por_req': 12.0, 'mem_gb': 1.0, 'dur_ms_por_req': 90.0,
    # Datos: bytes por cliente (cliente, tarjeta, tokens, índices) y por operación (compra, visita, sello, auditoría, índices)
    'bytes_cliente': 3500, 'bytes_op': 2600, 'bytes_negocio': 400_000,
    'overhead_bd_mb': 12.0,             # medido en Preview: 13 MB totales con ~1.7 MB de datos
    'kb_api_por_req': 4.0,
    'correos_negocio_mes': 4,
    'dias_mes': 30,
}

ESCENARIOS = [('A', 1, 300), ('B', 10, 300), ('C', 50, 300), ('D', 100, 300), ('E', 300, 300)]
PLANES_MXN = [299, 499]


def compute_tier(negocios, ops_pico_seg):
    """Escalón de cómputo de Supabase. Regla CONSERVADORA (no medida): la prueba de carga la valida o la corrige."""
    if negocios <= 50 and ops_pico_seg < 20:
        return 'micro'
    if negocios <= 120 and ops_pico_seg < 40:
        return 'small'
    if ops_pico_seg < 120:
        return 'medium'
    return 'large'


def modelo(esc, actividad, S=SUPUESTOS, P=PRECIOS):
    eid, n, cpn = esc
    clientes = n * cpn
    ops = clientes * S['ops_cliente_mes'][actividad]
    req_ops = ops * S['req_por_op']
    req_poll = n * S['dias_mes'] * (S['panel_min_dia'][actividad] * S['panel_req_min'] + S['caja_min_dia'][actividad] * S['caja_req_min'])
    req = req_ops + req_poll
    cpu_h = req * S['cpu_ms_por_req'] / 1000 / 3600
    gbh = req * S['dur_ms_por_req'] / 1000 / 3600 * S['mem_gb']
    vercel_uso = cpu_h * P['vercel_cpu_usd_h'] + gbh * P['vercel_mem_usd_gbh'] + req / 1e6 * P['vercel_inv_usd_m']
    vercel = S['asientos_vercel'] * P['vercel_pro_seat'] + max(0.0, vercel_uso - 20.0 * S['asientos_vercel'])
    bd_mb = S['overhead_bd_mb'] + (n * S['bytes_negocio'] + clientes * S['bytes_cliente'] + ops * 12 * S['bytes_op']) / 1e6
    egress_gb = req * S['kb_api_por_req'] / 1e6
    ops_pico_seg = ops / S['dias_mes'] * 0.25 / 3600 * 10   # 25 % del día en la hora pico, ráfagas de 10 s
    tier = compute_tier(n, ops_pico_seg)
    supa = P['supabase_pro_base'] + max(0.0, P['supabase_compute'][tier] - 10.0)
    supa += max(0.0, bd_mb / 1000 - P['supabase_disk_incl_gb']) * P['supabase_disk_usd_gb']
    supa += max(0.0, egress_gb - P['supabase_egress_incl_gb']) * P['supabase_egress_usd_gb']
    correos = n * S['correos_negocio_mes']
    resend = 0.0 if correos <= P['resend_free_month'] and correos / S['dias_mes'] * 3 <= P['resend_free_day'] else P['resend_pro']
    total_usd = vercel + supa + resend
    total_mxn = total_usd * S['tipo_cambio_mxn_usd']
    fila = {
        'escenario': eid, 'actividad': actividad, 'negocios': n, 'clientes': clientes, 'ops_mes': round(ops),
        'req_mes': round(req), 'req_poll_pct': round(req_poll / req * 100), 'cpu_h': round(cpu_h, 2), 'gb_h': round(gbh, 1),
        'bd_mb_12m': round(bd_mb, 1), 'egress_gb': round(egress_gb, 2), 'compute': tier,
        'vercel_usd': round(vercel, 2), 'supabase_usd': round(supa, 2), 'correo_usd': round(resend, 2),
        'total_usd': round(total_usd, 2), 'total_mxn': round(total_mxn), 'costo_negocio_mxn': round(total_mxn / n, 1),
    }
    for p in PLANES_MXN:
        ingreso = n * p
        fila[f'ingreso_{p}'] = ingreso
        fila[f'margen_{p}_pct'] = round((ingreso - total_mxn) / ingreso * 100, 1)
        fila[f'equilibrio_{p}'] = math.ceil(total_mxn / p)
    return fila


def tabla(filas, cols):
    out = ['| ' + ' | '.join(cols) + ' |', '|' + '---|' * len(cols)]
    out += ['| ' + ' | '.join(str(f[c]) for c in cols) + ' |' for f in filas]
    return '\n'.join(out)


def sensibilidad():
    base = modelo(ESCENARIOS[-1], 'alta')['total_mxn']
    filas = []
    for clave, factor, etiqueta in [
        ('tipo_cambio_mxn_usd', 21 / 18.5, 'Tipo de cambio 21 MXN/USD'),
        ('cpu_ms_por_req', 3.0, 'CPU por solicitud x3 (36 ms)'),
        ('dur_ms_por_req', 3.0, 'Duración por solicitud x3 (270 ms)'),
        ('req_por_op', 2.0, 'Solicitudes por operación x2'),
        ('panel_req_min', 4.0, 'Sondeo del panel x4 (cada 2 s)'),
    ]:
        S = {**SUPUESTOS, clave: SUPUESTOS[clave] * factor}
        v = modelo(ESCENARIOS[-1], 'alta', S)['total_mxn']
        filas.append({'supuesto': etiqueta, 'total_mxn': v, 'cambio_pct': round((v - base) / base * 100, 1)})
    return base, filas


def main():
    filas = [modelo(e, a) for e in ESCENARIOS for a in ('baja', 'media', 'alta')]
    cols = ['escenario', 'actividad', 'negocios', 'clientes', 'ops_mes', 'req_mes', 'req_poll_pct', 'compute', 'bd_mb_12m',
            'vercel_usd', 'supabase_usd', 'correo_usd', 'total_mxn', 'costo_negocio_mxn', 'margen_299_pct', 'margen_499_pct', 'equilibrio_299', 'equilibrio_499']
    print(tabla(filas, cols))
    base, sens = sensibilidad()
    print(f'\nSensibilidad (E alta, base {base} MXN/mes)\n')
    print(tabla(sens, ['supuesto', 'total_mxn', 'cambio_pct']))
    if '--csv' in sys.argv:
        d = sys.argv[sys.argv.index('--csv') + 1]
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, 'v045_costos_escenarios.csv'), 'w', newline='', encoding='utf-8') as fh:
            w = csv.DictWriter(fh, fieldnames=list(filas[0].keys())); w.writeheader(); w.writerows(filas)
        with open(os.path.join(d, 'v045_costos_supuestos.csv'), 'w', newline='', encoding='utf-8') as fh:
            w = csv.writer(fh); w.writerow(['clave', 'valor'])
            for k, v in {**SUPUESTOS, **{f'precio_{k}': v for k, v in PRECIOS.items()}}.items():
                w.writerow([k, v])
        print(f'\nCSV escritos en {d}')


if __name__ == '__main__':
    main()
