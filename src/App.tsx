import Header from './components/Header'
import Hero from './components/Hero'
import Services from './components/Services'
import Method from './components/Method'
import Testimonials from './components/Testimonials'
import Faq from './components/Faq'
import Booking from './components/Booking'
import Footer from './components/Footer'

export default function App() {
  return (
    <div className="app">
      <Header />
      <main id="main">
        <Hero />
        <Services />
        <Method />
        <Testimonials />
        <Faq />
        <Booking />
      </main>
      <Footer />
    </div>
  )
}
