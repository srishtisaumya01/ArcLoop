import { Fragment, createElement } from 'react'
import { hi } from './hi.js'

const dictionaries = { hi }

// Replaces {name} placeholders with values. Unknown placeholders are left as they are.
export function interpolate(text, vars) {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match))
}

// Splits text at {name} placeholders and puts the given React nodes (links, bold text) in their place, so a sentence
// whose word order changes in another language keeps its links in the right spot.
export function richText(text, nodes) {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const key = part.match(/^\{(\w+)\}$/)?.[1]
    return key && key in nodes ? createElement(Fragment, { key: i }, nodes[key]) : part
  })
}

// The English text is the key. A missing translation falls back to the English text, so nothing is ever blank.
export function makeTranslator(lang) {
  const dictionary = dictionaries[lang]
  const lookup = (text) => dictionary?.[text] ?? text
  return {
    t: (text, vars) => interpolate(lookup(text), vars),
    tx: (text, nodes) => richText(lookup(text), nodes),
  }
}
