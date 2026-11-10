#!/usr/bin/env bash
# V0.4.6 · Auditoría de SOLO LECTURA del correo propio (Stalwart) para vlux.com.mx.
# No cambia configuraciones, no envía correos, no inicia sesión. Requiere: dig (bind-utils/dnsutils), openssl, nc.
# Uso:  bash scripts/stalwart-auditoria.sh vlux.com.mx mail.vlux.com.mx [selector_dkim]
# Pega la salida completa en el hilo para que se interprete (no contiene secretos).
set -u
D=${1:-vlux.com.mx}; H=${2:-mail.$D}; SEL=${3:-}
r() { printf '\n== %s\n' "$1"; }
r "MX de $D";            dig +short MX "$D"
r "A/AAAA de $H";        dig +short A "$H"; dig +short AAAA "$H"
IP=$(dig +short A "$H" | tail -1)
r "rDNS (PTR) de $IP";   [ -n "$IP" ] && dig +short -x "$IP"
r "SPF (TXT de $D)";     dig +short TXT "$D" | grep -i 'v=spf1' || echo "SIN SPF"
r "DMARC";               dig +short TXT "_dmarc.$D" || true
r "MTA-STS / TLS-RPT";   dig +short TXT "_mta-sts.$D"; dig +short TXT "_smtp._tls.$D"
r "CAA";                 dig +short CAA "$D"
if [ -n "$SEL" ]; then r "DKIM $SEL._domainkey.$D"; dig +short TXT "$SEL._domainkey.$D"; else
  for s in default stalwart mail dkim rsa ed25519 202401 202501 202601; do v=$(dig +short TXT "$s._domainkey.$D"); [ -n "$v" ] && { r "DKIM $s"; echo "$v"; }; done; fi
r "Puertos accesibles desde ESTA red (25/465/587/993/443/8080)"
for p in 25 465 587 993 443 8080; do timeout 6 bash -c "echo > /dev/tcp/$H/$p" 2>/dev/null && echo "$p abierto" || echo "$p cerrado/filtrado"; done
r "Banner SMTP 25 (EHLO)"; (printf 'EHLO auditoria.vlux.invalid\r\nQUIT\r\n'; sleep 3) | timeout 10 nc "$H" 25 2>&1 | head -20
r "Certificado TLS en 465";  echo | timeout 10 openssl s_client -connect "$H:465" -servername "$H" -verify_return_error 2>&1 | grep -E 'subject=|issuer=|Verify return code|NotAfter|DNS:' | head
r "STARTTLS en 587";        echo | timeout 10 openssl s_client -starttls smtp -connect "$H:587" -servername "$H" -verify_return_error 2>&1 | grep -E 'subject=|issuer=|Verify return code' | head
r "STARTTLS en 25";         echo | timeout 10 openssl s_client -starttls smtp -connect "$H:25" -servername "$H" -verify_return_error 2>&1 | grep -E 'subject=|issuer=|Verify return code' | head
r "¿Panel web de Stalwart expuesto? (443/8080, solo encabezados)"
for u in "https://$H/" "https://$H/login" "http://$H:8080/"; do echo "$u → $(curl -s -o /dev/null -m 8 -w '%{http_code}' "$u")"; done
r "Salida por el puerto 25 desde esta red (bloqueo del ISP)"
timeout 8 bash -c 'echo > /dev/tcp/gmail-smtp-in.l.google.com/25' 2>/dev/null && echo "25 saliente PERMITIDO" || echo "25 saliente BLOQUEADO (común en ISP residenciales)"
r "Listas negras (DNSBL) de $IP"
if [ -n "$IP" ]; then rev=$(echo "$IP" | awk -F. '{print $4"."$3"."$2"."$1}'); for bl in zen.spamhaus.org bl.spamcop.net b.barracudacentral.org; do a=$(dig +short "$rev.$bl"); echo "$bl: ${a:-no listado}"; done; fi
echo; echo "Fin. Nada se modificó."
