// Hoja del tema claro (CSS generado): solo se descarga si se usa. Los usuarios en oscuro no la pagan.
let lightSheet = null
export const loadLightTheme = () => {
  lightSheet ??= import('../../styles/tema-claro.generated.css').catch(() => { lightSheet = null })
  return lightSheet
}