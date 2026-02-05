export interface CorrectionLegendSymbol {
  symbol: string;
  label: string;
  description?: string;
}

export interface CorrectionLegendGroup {
  key: string;
  label: string;
  color?: string;
  symbols: CorrectionLegendSymbol[];
}

export interface CorrectionLegend {
  version: string;
  description?: string;
  groups: CorrectionLegendGroup[];
}
