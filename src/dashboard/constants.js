export const METRICS = ['bleu_1', 'bleu_2', 'bleu_3', 'bleu_4', 'meteor', 'rouge_l', 'cider', 'spice'];

export const METRIC_LABELS = {
  bleu_1: 'BLEU-1', bleu_2: 'BLEU-2', bleu_3: 'BLEU-3', bleu_4: 'BLEU-4',
  meteor: 'METEOR', rouge_l: 'ROUGE-L', cider: 'CIDEr', spice: 'SPICE',
};

export const LOSS_ACC_METRICS = ['loss', 'accuracy'];

export const LOSS_ACC_LABELS = {
  loss: 'Loss', accuracy: 'Accuracy',
};

export const LOWER_IS_BETTER = new Set(['loss']);

export const CHART_COLORS = [
  '#63b3ed', '#a78bfa', '#f687b3', '#68d391', '#fbd38d',
  '#fc8181', '#76e4f7', '#f6ad55', '#9ae6b4', '#b794f4',
  '#feb2b2', '#90cdf4', '#d6bcfa', '#fbb6ce',
];

export const JOURNAL_BASELINE = {
  name: 'Jurnal Referensi',
  results: {
    bleu_1: 0.492,
    bleu_2: 0.296,
    bleu_3: 0.174,
    bleu_4: 0.101,
    meteor: 0.163,
    cider: 0.39,
    rouge_l: 0.358,
    spice: 0.108
  }
};
