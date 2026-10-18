import { usePageMeta } from '../../hooks/usePageMeta.js'
import Hero from '../../components/landing/Hero.jsx'
import ImpactStats from '../../components/landing/ImpactStats.jsx'
import HowItWorks from '../../components/landing/HowItWorks.jsx'
import MomentumSection from '../../components/landing/MomentumSection.jsx'
import AutomationSection from '../../components/landing/AutomationSection.jsx'
import Benefits from '../../components/landing/Benefits.jsx'
import GroupsSection from '../../components/landing/GroupsSection.jsx'
import ChallengesSection from '../../components/landing/ChallengesSection.jsx'
import Faq from '../../components/landing/Faq.jsx'
import FinalCta from '../../components/landing/FinalCta.jsx'

export default function HomePage() {
  usePageMeta('', 'Arcloop helps you build habits and work toward goals, with friends and groups to keep you going.')
  return (
    <>
      <Hero />
      <ImpactStats />
      <HowItWorks />
      <MomentumSection />
      <AutomationSection />
      <Benefits />
      <GroupsSection />
      <ChallengesSection />
      <Faq />
      <FinalCta />
    </>
  )
}
