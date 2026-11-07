#!/usr/bin/env python3
"""VLUX Loyalty 1.0.0-rc.1 · Modelo de margen por plan (reproducible).
Uso: python3 scripts/finanzas-rc1.py
Precios oficiales leídos el 2026-11-07 (ver docs/release-1.0/FINANCIAL_MODEL.md). Todo lo demás es SUPUESTO editable.
Resultado = contribución antes de ISR, sueldos y gastos comerciales de VLUX."""
import math

# ---- precios oficiales
VERCEL_PRO_USD = 20.0          # por asiento, incluye 20 USD de uso
SUPABASE_PRO_USD = 25.0        # incluye 10 USD de cómputo (Micro)
STRIPE_PCT, STRIPE_FIJO_MXN = 0.036, 3.00   # tarjetas nacionales, sin IVA
IVA = 0.16

# ---- supuestos (HIPÓTESIS)
TIPO_CAMBIO = 18.5             # MXN por USD
DOMINIO_MXN_ANUAL = 500.0
COSTO_HORA_MXN = 250.0         # costo interno de una hora de soporte/onboarding
MIN_SOPORTE_MES = [15, 30, 60] # minutos de soporte por negocio al mes
ONBOARDING_H = 3.0             # alta, configuración, QR, capacitación (a medir en el piloto)
CAC_MXN = 1500.0               # visitas, transporte, demo (a medir)
PLANES = [299, 499]            # MXN/mes por sucursal, + IVA
NEGOCIOS = [1, 5, 10, 50, 100, 300]


def infra_mxn(n):
    """Fijo mensual. Escalones de cómputo según scripts/costos-v045.py (actividad media)."""
    usd = VERCEL_PRO_USD + SUPABASE_PRO_USD
    if n > 50: usd += 5        # Small
    if n > 100: usd += 50 + 20 # Medium + Resend Pro (si se activa correo)
    return usd * TIPO_CAMBIO + DOMINIO_MXN_ANUAL / 12


def comision(precio):
    return (precio * (1 + IVA) * STRIPE_PCT + STRIPE_FIJO_MXN) * (1 + IVA)


print(f"Fijo base: {infra_mxn(1):,.0f} MXN/mes\n")
for p in PLANES:
    for m in MIN_SOPORTE_MES:
        contrib = p - comision(p) - m / 60 * COSTO_HORA_MXN
        eq = math.ceil(infra_mxn(1) / contrib) if contrib > 0 else '—'
        recup = (CAC_MXN + ONBOARDING_H * COSTO_HORA_MXN) / contrib if contrib > 0 else float('inf')
        cols = ' | '.join(f"{n*contrib - infra_mxn(n):,.0f} ({(n*contrib - infra_mxn(n))/(n*p)*100:.0f}%)" for n in NEGOCIOS)
        print(f"| {p} | {m} min | comisión {comision(p):.2f} | contribución {contrib:.0f} | equilibrio {eq} | recupera CAC+alta en {recup:.1f} meses | {cols} |")
