import React from 'react';
import './services.css';

// Asset imports
import brandingCard from './assets/branding-card.png';
import marketingCard from './assets/marketing-card.png';
import marketingPhoto from './assets/marketing-photo.png';
import websiteCard from './assets/website-card.png';
import aiCard from './assets/ai-card.png';
import aiPhoto from './assets/ai-photo.png';
import noteArrowClover from './assets/note-arrow-clover.png';
import flower1 from './assets/flower-1.png';
import flower2 from './assets/flower-2.png';
import impactNote from './assets/impact-note.png';

const ServicesPage = () => {
  return (
    <section className="services-page">
      <div className="services-artboard">
        {/* LEFT TITLE */}
        <div className="services-title">
          <h1>OUR<br />CAPABILITIES</h1>
        </div>

        {/* GOLD NOTE / ARROW / CLOVER */}
        <img
          src={noteArrowClover}
          className="asset intro-note"
          alt="Everything your brand needs to be remembered"
        />

        {/* BRANDING */}
        <img
          src={brandingCard}
          className="asset branding-card"
          alt="Branding services"
        />

        {/* MARKETING */}
        <img
          src={marketingCard}
          className="asset marketing-card"
          alt="Marketing services"
        />

        <img
          src={marketingPhoto}
          className="asset marketing-photo"
          alt="Marketing workspace"
        />

        {/* WEBSITE */}
        <img
          src={websiteCard}
          className="asset website-card"
          alt="Website development services"
        />

        {/* AI */}
        <img
          src={aiCard}
          className="asset ai-card"
          alt="AI automation services"
        />

        <img
          src={aiPhoto}
          className="asset ai-photo"
          alt="AI automation workspace"
        />

        {/* FLOWERS */}
        <img
          src={flower1}
          className="asset flowers-top"
          alt=""
        />

        <img
          src={flower2}
          className="asset flowers-bottom"
          alt=""
        />

        {/* BOTTOM NOTE */}
        <img
          src={impactNote}
          className="asset impact-note"
          alt="We don't just create. We create impact."
        />
      </div>
    </section>
  );
};

export default ServicesPage;
