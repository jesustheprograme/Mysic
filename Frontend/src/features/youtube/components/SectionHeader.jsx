// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/components/SectionHeader.jsx
export function SectionHeader({ title, onShowAll }) {
  return (
    <div className="section-header">
      <h3 className="section-title">{title}</h3>
      {onShowAll && (
        <button className="show-all" onClick={onShowAll}>
          Mostrar todo
        </button>
      )}
    </div>
  );
}
