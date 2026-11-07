# V0.4.6 · Auditoría de SOLO LECTURA del correo propio (Stalwart) desde Windows (PowerShell 5+).
# No cambia configuraciones, no envía correos, no inicia sesión.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\stalwart-auditoria.ps1 -Domain vlux.com.mx -MailHost mail.vlux.com.mx
param([string]$Domain = 'vlux.com.mx', [string]$MailHost = '', [string]$Selector = '')
if (-not $MailHost) { $MailHost = "mail.$Domain" }
function T($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Q($n, $t) { try { Resolve-DnsName -Name $n -Type $t -ErrorAction Stop | Format-Table -AutoSize | Out-String -Width 200 } catch { "sin registro $t para $n" } }
T "MX"; Q $Domain MX
T "A de $MailHost"; Q $MailHost A
$ip = (Resolve-DnsName $MailHost -Type A -ErrorAction SilentlyContinue | Where-Object IPAddress | Select-Object -First 1).IPAddress
if ($ip) { T "rDNS de $ip"; Q $ip PTR }
T "SPF / TXT"; Q $Domain TXT
T "DMARC"; Q "_dmarc.$Domain" TXT
T "MTA-STS / TLS-RPT"; Q "_mta-sts.$Domain" TXT; Q "_smtp._tls.$Domain" TXT
$sels = if ($Selector) { @($Selector) } else { @('default','stalwart','mail','dkim','rsa','ed25519','202401','202501','202601') }
foreach ($s in $sels) { $r = Resolve-DnsName "$s._domainkey.$Domain" -Type TXT -ErrorAction SilentlyContinue; if ($r) { T "DKIM $s"; $r | Format-Table -AutoSize | Out-String -Width 300 } }
T "Puertos de $MailHost desde esta red"
foreach ($p in 25,465,587,993,443,8080) { $ok = Test-NetConnection $MailHost -Port $p -WarningAction SilentlyContinue -InformationLevel Quiet; "$p " + ($(if ($ok) {'abierto'} else {'cerrado/filtrado'})) }
T "Salida por puerto 25 (bloqueo del ISP)"
$o = Test-NetConnection gmail-smtp-in.l.google.com -Port 25 -WarningAction SilentlyContinue -InformationLevel Quiet
if ($o) { '25 saliente PERMITIDO' } else { '25 saliente BLOQUEADO (común en ISP residenciales)' }
T "Certificado TLS en 465"
try {
  $c = New-Object Net.Sockets.TcpClient($MailHost, 465); $s = New-Object Net.Security.SslStream($c.GetStream(), $false)
  $s.AuthenticateAsClient($MailHost); $cert = $s.RemoteCertificate
  "Emisor: $($cert.Issuer)"; "Sujeto: $($cert.Subject)"; "Vence: $($cert.GetExpirationDateString())"; 'Validación TLS: OK'
  $s.Dispose(); $c.Dispose()
} catch { "Validación TLS FALLÓ en 465: $($_.Exception.Message)" }
T "¿Panel web expuesto? (solo código HTTP)"
foreach ($u in "https://$MailHost/", "https://$MailHost/login", "http://${MailHost}:8080/") { try { $r = Invoke-WebRequest $u -Method Head -TimeoutSec 8 -UseBasicParsing; "$u → $($r.StatusCode)" } catch { "$u → $($_.Exception.Message)" } }
"`nFin. Nada se modificó."
