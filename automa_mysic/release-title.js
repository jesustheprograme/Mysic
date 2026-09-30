function containsJapanese(value) {
  return /[\u3040-\u30ff\u3400-\u9fff]/u.test(String(value || ''))
}

function containsLatin(value) {
  return /[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]/u.test(String(value || ''))
}

function hasRomanizedSuffix(value) {
  return /\([^)]*[A-Za-zÀ-ÖØ-öø-ÿĀ-ž][^)]*\)\s*$/u.test(String(value || ''))
}

function entityAliases(entity) {
  return [
    ...(entity?.aliases || []),
    ...(entity?.['release-group']?.aliases || []),
  ]
}

function romanizedAlias(...entities) {
  const aliases = entities.flatMap(entityAliases)
  return aliases
    .filter((alias) => containsLatin(alias.name) && !containsJapanese(alias.name))
    .sort((left, right) => {
      const leftRank = left.primary && left.locale === 'en' ? 0 : left.locale === 'en' ? 1 : 2
      const rightRank = right.primary && right.locale === 'en' ? 0 : right.locale === 'en' ? 1 : 2
      return leftRank - rightRank
    })[0]?.name?.trim() || null
}

function formatJapaneseTitle(title, ...sources) {
  const original = String(title || '').trim()
  if (!containsJapanese(original)) return original
  if (hasRomanizedSuffix(original)) return original
  const romanized = romanizedAlias(...sources)
  return romanized ? `${original} (${romanized})` : original
}

function formatJapaneseReleaseTitle(title, release) {
  return formatJapaneseTitle(title, release)
}

function formatJapaneseTrackTitle(title, { recording, works = [], release } = {}) {
  const comparableTitle = String(title || '').normalize('NFKC').trim()
  const comparableRelease = String(release?.title || '').normalize('NFKC').trim()
  const matchingRelease = comparableTitle === comparableRelease ? release : null
  return formatJapaneseTitle(title, recording, ...works, matchingRelease)
}

module.exports = {
  containsJapanese,
  formatJapaneseReleaseTitle,
  formatJapaneseTrackTitle,
  hasRomanizedSuffix,
  romanizedAlias,
}
