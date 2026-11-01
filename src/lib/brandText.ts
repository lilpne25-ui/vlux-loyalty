// Texto institucional de VLUX configurable. DECISIÓN PENDIENTE del dueño: el documento de identidad (borrador) dice
// "AI Transformation Partner" y otra fuente menciona "eTransformation Partner". No se cambia el posicionamiento:
// el valor por omisión es el del documento oficial y se sobrescribe con VITE_VLUX_TAGLINE sin tocar el código.
export const VLUX_TAGLINE: string = (import.meta.env.VITE_VLUX_TAGLINE as string | undefined)?.trim().slice(0, 60) || 'AI Transformation Partner';
