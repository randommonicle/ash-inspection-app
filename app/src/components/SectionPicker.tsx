import { SECTION_LABELS, SECTION_ORDER, type SectionKey } from '../types'

interface Props {
  current: SectionKey
  onSelect: (key: SectionKey) => void
  onClose: () => void
}

export function SectionPicker({ current, onSelect, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl shadow-xl max-h-[70vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="font-semibold text-ash-navy text-sm">Assign to section</span>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-base active:bg-gray-200">✕</button>
        </div>
        <ul className="divide-y divide-gray-50">
          {SECTION_ORDER.map(key => (
            <li key={key}>
              <button
                onClick={() => onSelect(key)}
                className={`w-full text-left px-4 py-3 text-sm transition active:bg-gray-50
                  ${key === current ? 'text-ash-navy font-semibold bg-ash-light/30' : 'text-gray-700'}`}
              >
                {SECTION_LABELS[key]}
                {key === current && <span className="ml-2 text-xs text-ash-mid">current</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
