
import dynamic from "next/dynamic";
const DamageIntakeForm = dynamic(() => import("../components/DamageIntakeForm.jsx"), { ssr: false });
export default function Home(){ return <DamageIntakeForm/>; }
