const STORAGE_KEY = 'kreyol_glossary_v1'

const emptyGlossary = () => ({
  defaultIntensity: 0.4,
  vocabulary: [],
  spelling: [],
})

const cleanList = (items, mapper) => (Array.isArray(items) ? items : [])
  .map(mapper)
  .filter(Boolean)

export function readKreyolGlossary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!parsed || typeof parsed !== 'object') return emptyGlossary()

    return {
      defaultIntensity: Number.isFinite(Number(parsed.defaultIntensity))
        ? Math.min(1, Math.max(0, Number(parsed.defaultIntensity)))
        : 0.4,
      vocabulary: cleanList(parsed.vocabulary, (entry) => {
        const value = entry?.value?.trim()
        if (!value) return null
        return {
          id: entry.id || crypto.randomUUID(),
          value,
          pronunciations: cleanList(entry.pronunciations, (item) => item?.trim() || null),
          intensity: Number.isFinite(Number(entry.intensity)) ? Math.min(1, Math.max(0, Number(entry.intensity))) : null,
          enabled: entry.enabled !== false,
        }
      }),
      spelling: cleanList(parsed.spelling, (entry) => {
        const value = entry?.value?.trim()
        const variants = cleanList(entry?.variants, (item) => item?.trim() || null)
        if (!value || !variants.length) return null
        return { id: entry.id || crypto.randomUUID(), value, variants, enabled: entry.enabled !== false }
      }),
    }
  } catch {
    return emptyGlossary()
  }
}

export function saveKreyolGlossary(glossary) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(glossary))
}

export function getGladiaGlossaryProcessing() {
  const glossary = readKreyolGlossary()
  const vocabulary = glossary.vocabulary
    .filter((entry) => entry.enabled)
    .map(({ value, pronunciations, intensity }) => ({
      value,
      ...(pronunciations.length ? { pronunciations } : {}),
      ...(intensity === null ? {} : { intensity }),
      language: 'ht',
    }))
  const spellingDictionary = Object.fromEntries(
    glossary.spelling
      .filter((entry) => entry.enabled)
      .map(({ value, variants }) => [value, variants])
  )
  const hasSpelling = Object.keys(spellingDictionary).length > 0

  return {
    custom_vocabulary: vocabulary.length > 0,
    ...(vocabulary.length ? {
      custom_vocabulary_config: {
        vocabulary,
        default_intensity: glossary.defaultIntensity,
      },
    } : {}),
    custom_spelling: hasSpelling,
    ...(hasSpelling ? { custom_spelling_config: { spelling_dictionary: spellingDictionary } } : {}),
  }
}
