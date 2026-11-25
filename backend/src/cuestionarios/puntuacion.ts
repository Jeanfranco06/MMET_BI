export interface ScoredItem {
  numero_item: number;
  puntuacion_inversa: boolean;
}

export function calcularPuntuacion(
  items: ScoredItem[],
  answers: Array<{ numero_item: number; valor: number }>,
) {
  const values = new Map(answers.map((answer) => [answer.numero_item, answer.valor]));
  return items.reduce((total, item) => {
    const value = values.get(Number(item.numero_item));
    if (value === undefined || !Number.isInteger(value) || value < 0 || value > 4) {
      throw new Error(`Respuesta inválida en el ítem ${item.numero_item}.`);
    }
    return total + (item.puntuacion_inversa ? 4 - value : value);
  }, 0);
}
