import dynamic from 'next/dynamic'

// Dinamiski ielādējam komponenti tikai klientā (bez SSR),
// citādi 'xlsx' var radīt kļūdas servera pusē.
const DamageIntakeForm = dynamic(
  () => import('../components/DamageIntakeForm'),
  { ssr: false }
)

export default function Home() {
  return <DamageIntakeForm />
}
