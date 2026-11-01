# V0.4.3 · Instalación de skills y auditoría visual

## Instalación (verificada)
| Skill | Fuente | Versión | Cómo |
|---|---|---|---|
| `frontend-design` | Plugin oficial `frontend-design@claude-plugins-official` (marketplace `anthropics/claude-plugins-official`) | 1.1.1, commit a7ba5b93 | `claude plugin marketplace add anthropics/claude-plugins-official` y `claude plugin install … --scope user` |
| `apple-ui-design` | `BarisSozen/claude`, `.claude/skills/apple-ui-design/SKILL.md`, commit b567d446 | 3 109 bytes | Copia manual tras revisar el contenido (no se ejecutó el instalador `npx`). Licencia MIT declarada en el `package.json` del repo; no hay archivo LICENSE |

Revisión previa de `apple-ui-design`: un solo SKILL.md de guía (tipografía, color, espaciado, checklist), sin scripts ni dependencias. Es una guía genérica de estilo Apple; no define componentes.

**Reconocimiento:** `claude plugin list` muestra frontend-design 1.1.1 habilitado; una sesión nueva de `claude -p` lista ambas skills; esa sesión las invocó con la herramienta Skill. La sesión actual de trabajo solo cargó `apple-ui-design` (se instaló después de iniciar); `frontend-design` se aplicó mediante la sesión nueva.

## Auditoría visual (6 hallazgos confirmados sobre capturas) y correcciones
1. Placa del logo parecía una etiqueta en relieve → más plana (padding 1.5px, radio 11px, sin sombra de bisel).
2. Sellos convexos y huecos con borde punteado → relieve contenido y hueco grabado de línea continua.
3. Cepillado marcado en Silver → opacidad .30 → .20.
4. Marco interior doble → línea interior más sutil (.8 → .55).
5. Brillo lechoso en Black Titanium y Signature Color → .24 → .16 y .30 → .20.
6. Texto secundario con poco contraste → alfa de .60–.65 a .72–.74.

Antes/después: `docs/evidencia/capturas/v043s-antes-*.png` y `v043s-despues-*.png`.
No cambió: proporciones del logo (ya verificadas sin deformación), funcionalidades ni el lema.

## Límites
- La auditoría con las skills fue sobre las capturas locales; no hay dispositivos físicos iPhone/Android probados.
- Panel del dueño, caja y Control Center no se rediseñaron: no hubo problemas confirmados en esta pasada.
