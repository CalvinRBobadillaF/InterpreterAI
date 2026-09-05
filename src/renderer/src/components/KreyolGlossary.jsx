import { useState } from 'react'
import { BookOpen, Plus, Trash2, X } from 'lucide-react'
import { readKreyolGlossary, saveKreyolGlossary } from '../hooks/kreyolGlossary'

const newId = () => crypto.randomUUID()
const splitItems = (value) => value.split(',').map((item) => item.trim()).filter(Boolean)

export function KreyolGlossary({ onClose }) {
  const [glossary, setGlossary] = useState(readKreyolGlossary)
  const [term, setTerm] = useState('')
  const [soundsLike, setSoundsLike] = useState('')
  const [preferred, setPreferred] = useState('')
  const [variants, setVariants] = useState('')

  const update = (next) => {
    setGlossary(next)
    saveKreyolGlossary(next)
  }
  const addVocabulary = (event) => {
    event.preventDefault()
    if (!term.trim()) return
    update({ ...glossary, vocabulary: [...glossary.vocabulary, {
      id: newId(), value: term.trim(), pronunciations: splitItems(soundsLike), intensity: null, enabled: true,
    }] })
    setTerm(''); setSoundsLike('')
  }
  const addSpelling = (event) => {
    event.preventDefault()
    const cleanVariants = splitItems(variants)
    if (!preferred.trim() || !cleanVariants.length) return
    update({ ...glossary, spelling: [...glossary.spelling, {
      id: newId(), value: preferred.trim(), variants: cleanVariants, enabled: true,
    }] })
    setPreferred(''); setVariants('')
  }
  const remove = (type, id) => update({ ...glossary, [type]: glossary[type].filter((entry) => entry.id !== id) })

  return (
    <div className="glossary-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="glossary-dialog" role="dialog" aria-modal="true" aria-labelledby="glossary-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="glossary-header">
          <div><h2 id="glossary-title"><BookOpen size={18} /> Kreyòl accuracy glossary</h2><p>Changes apply when the next Kreyòl session starts.</p></div>
          <button className="glossary-close" onClick={onClose} aria-label="Close glossary"><X size={18} /></button>
        </header>

        <div className="glossary-content">
          <section className="glossary-section">
            <h3>Sounds-like vocabulary</h3>
            <p>For names or terms Gladia hears as a different word. Add comma-separated ways the term sounds when spoken.</p>
            <form className="glossary-form" onSubmit={addVocabulary}>
              <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Correct term, e.g. Pétion-Ville" />
              <input value={soundsLike} onChange={(event) => setSoundsLike(event.target.value)} placeholder="Sounds like (optional), e.g. Petion vil" />
              <button type="submit"><Plus size={15} /> Add term</button>
            </form>
            <GlossaryList entries={glossary.vocabulary} empty="No vocabulary terms yet." detail={(entry) => entry.pronunciations.join(', ')} onRemove={(id) => remove('vocabulary', id)} />
          </section>

          <section className="glossary-section">
            <h3>Exact spelling corrections</h3>
            <p>For words Gladia recognizes but spells consistently wrong. The variants are replaced exactly.</p>
            <form className="glossary-form" onSubmit={addSpelling}>
              <input value={preferred} onChange={(event) => setPreferred(event.target.value)} placeholder="Preferred spelling, e.g. Ayiti" />
              <input value={variants} onChange={(event) => setVariants(event.target.value)} placeholder="Replace variants, comma-separated" />
              <button type="submit"><Plus size={15} /> Add correction</button>
            </form>
            <GlossaryList entries={glossary.spelling} empty="No spelling corrections yet." detail={(entry) => entry.variants.join(', ')} onRemove={(id) => remove('spelling', id)} />
          </section>
        </div>
      </section>
    </div>
  )
}

function GlossaryList({ entries, empty, detail, onRemove }) {
  if (!entries.length) return <p className="glossary-empty">{empty}</p>
  return <ul className="glossary-list">
    {entries.map((entry) => <li key={entry.id}><div><strong>{entry.value}</strong>{detail(entry) && <span>{detail(entry)}</span>}</div><button onClick={() => onRemove(entry.id)} aria-label={`Remove ${entry.value}`}><Trash2 size={15} /></button></li>)}
  </ul>
}
