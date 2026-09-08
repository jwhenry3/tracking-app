import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type FormFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  id?: string
}

export function FormField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  id,
}: FormFieldProps) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </div>
  )
}
