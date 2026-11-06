// V0.4.5 · Ícono del giro según el catálogo (shared/catalog.ts). Solo íconos importados aquí (sin cargar toda la librería).
import React from 'react';
import { Car, Coffee, Dumbbell, Flower2, Glasses, Hand, PawPrint, Scissors, Shirt, Smile, Sparkles, Stethoscope, Store, UtensilsCrossed, Watch, Wrench, type LucideIcon } from 'lucide-react';
import { verticalInfo } from '../../shared/catalog';

const ICONS: Record<string, LucideIcon> = { Car, Coffee, Dumbbell, Flower2, Glasses, Hand, PawPrint, Scissors, Shirt, Smile, Sparkles, Stethoscope, Store, UtensilsCrossed, Watch, Wrench };

export function VerticalIcon({ v, size = 17 }: { v: string; size?: number }) {
  const I = ICONS[verticalInfo(v).icon] ?? Store;
  return <I size={size} />;
}
