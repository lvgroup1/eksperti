import dynamic from 'next/dynamic'
const DamageIntakeForm = dynamic(() => import('../components/DamageIntakeForm'), { ssr: false })

export default function Home() {
  return <DamageIntakeForm />
}
