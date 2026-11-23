// -----------------------------------------------------------------------------
// HomeWhiz brand and appliance type codes (Arçelik IoT platform).
// -----------------------------------------------------------------------------

export const BRANDS = {
  1: 'Arçelik',
  2: 'Grundig',
  3: 'Beko',
  4: 'Blomberg',
  5: 'Elektrabregenz',
  6: 'Arctic',
  7: 'Defy',
  8: 'Leisure',
  9: 'Flavel',
  10: 'Altus',
  11: 'Dawlance',
  12: 'Viking',
  13: 'Cylinda',
  14: 'Smeg',
  15: 'V-Zug',
  16: 'Lamona',
  17: 'Teka',
  18: 'Voltas Beko',
  36: 'Whirlpool',
  39: 'Bauknecht',
};

export const brandName = (code) => BRANDS[code] ?? 'Arçelik';

export const APPLIANCE_TYPES = {
  1: 'washer',
  2: 'refrigerator',
  3: 'dishwasher',
  4: 'oven',
  5: 'dryer',
  7: 'hob',
  8: 'hood',
  9: 'air_conditioner',
  27: 'tea_machine',
  30: 'washer_dryer',
  31: 'tea_coffee_machine',
};

/** Human name of an appliance type, in the 4 supported languages. */
export const APPLIANCE_TYPE_LABELS = {
  washer: { en: 'Washing machine', fr: 'Lave-linge', de: 'Waschmaschine', es: 'Lavadora' },
  refrigerator: { en: 'Refrigerator', fr: 'Réfrigérateur', de: 'Kühlschrank', es: 'Frigorífico' },
  dishwasher: { en: 'Dishwasher', fr: 'Lave-vaisselle', de: 'Geschirrspüler', es: 'Lavavajillas' },
  oven: { en: 'Oven', fr: 'Four', de: 'Backofen', es: 'Horno' },
  dryer: { en: 'Dryer', fr: 'Sèche-linge', de: 'Wäschetrockner', es: 'Secadora' },
  hob: { en: 'Hob', fr: 'Table de cuisson', de: 'Kochfeld', es: 'Placa de cocción' },
  hood: { en: 'Cooker hood', fr: 'Hotte', de: 'Dunstabzugshaube', es: 'Campana' },
  air_conditioner: {
    en: 'Air conditioner',
    fr: 'Climatiseur',
    de: 'Klimaanlage',
    es: 'Aire acondicionado',
  },
  tea_machine: { en: 'Tea machine', fr: 'Théière', de: 'Teemaschine', es: 'Tetera' },
  washer_dryer: {
    en: 'Washer dryer',
    fr: 'Lave-linge séchant',
    de: 'Waschtrockner',
    es: 'Lavadora secadora',
  },
  tea_coffee_machine: {
    en: 'Tea & coffee machine',
    fr: 'Machine à thé et café',
    de: 'Tee- und Kaffeemaschine',
    es: 'Máquina de té y café',
  },
  appliance: { en: 'Appliance', fr: 'Appareil', de: 'Gerät', es: 'Electrodoméstico' },
};

export const applianceType = (code) => APPLIANCE_TYPES[code] ?? 'appliance';

// HomeWhiz content languages for the 4 languages of the integration.
export const HOMEWHIZ_LANGUAGES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };
