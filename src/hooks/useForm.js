import { useState } from 'react'

// Small controlled-form helper. `validate(values)` returns { field: message }.
// Fields must use id `field-<name>` so the first invalid one can receive focus.
export function useForm({ initialValues, validate }) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})

  const onChange = (event) => {
    const { name, type, value, checked } = event.target
    setValues((v) => ({ ...v, [name]: type === 'checkbox' ? checked : value }))
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e))
  }

  // Validate on blur only once the user has typed something, so tabbing past an
  // empty field does not produce an error.
  const onBlur = (event) => {
    const { name, value } = event.target
    if (!value) return
    setErrors((e) => ({ ...e, [name]: validate(values)[name] }))
  }

  const handleSubmit = (onValid) => (event) => {
    event.preventDefault()
    const found = validate(values)
    const invalid = Object.keys(found).filter((k) => found[k])
    setErrors(found)
    if (invalid.length > 0) {
      document.getElementById(`field-${invalid[0]}`)?.focus()
      return
    }
    onValid(values)
  }

  return { values, errors, onChange, onBlur, handleSubmit }
}
