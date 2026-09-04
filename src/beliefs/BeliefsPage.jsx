import React from 'react';
import './beliefs.css';

// Asset imports
import clarityBanner from './assets/clarity_over_noise_paper_banner.png';
import ideasBanner from './assets/torn_paper_editorial_banner.png';
import peopleBanner from './assets/torn_paper_banner_people_before_algorithms.png';
import designBanner from './assets/design_with_a_reason_paper_ribbon.png';
import buildBanner from './assets/build_for_what_comes_next.png';
import oliveSprig from './assets/olive_sprig_with_masking_tape.png';

const BeliefsPage = () => {
  return (
    <section className="beliefs-editorial-section">
      <div className="beliefs-editorial-container">
        
        {/* 1. EDITORIAL HEADER */}
        <div className="beliefs-header">
          <div className="beliefs-header__top">
            <h2 className="beliefs-header__title">WHAT WE BELIEVE IN</h2>
            <span className="beliefs-header__annotation">
              core studio principles
              <svg className="beliefs-star-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 0 C12 6.5 6.5 12 0 12 C6.5 12 12 17.5 12 24 C12 17.5 17.5 12 24 12 C17.5 12 12 6.5 12 0 Z"/>
              </svg>
            </span>
          </div>
          <div className="beliefs-header__divider"></div>
        </div>

        {/* 2. COLLAGE ARTBOARD */}
        <div className="beliefs-artboard">
        {/* 01 Clarity Over Noise */}
        <div className="belief-banner-item banner--01">
          <img src="/src/beliefs/assets/clean_blank_banner_01.png" className="belief-banner-bg" alt="" aria-hidden="true" />
          <div className="belief-banner-content">
            <span className="belief-banner-num">01</span>
            <div className="belief-banner-divider"></div>
            <div className="belief-banner-text">
              <h3 className="belief-banner-title">Clarity over noise.</h3>
              <p className="belief-banner-desc">We remove fluff and unnecessary decoration so your brand statement lands with force.</p>
            </div>
          </div>
        </div>

        {/* 02 Ideas Before Decoration */}
        <div className="belief-banner-item banner--02">
          <img src="/src/beliefs/assets/clean_blank_banner_02.png" className="belief-banner-bg" alt="" aria-hidden="true" />
          <div className="belief-banner-content">
            <span className="belief-banner-num">02</span>
            <div className="belief-banner-divider"></div>
            <div className="belief-banner-text">
              <h3 className="belief-banner-title">Ideas before decoration.</h3>
              <p className="belief-banner-desc">Design without strategy is just art. We start every project with positioning.</p>
            </div>
          </div>
        </div>

        {/* 03 People Before Algorithms */}
        <div className="belief-banner-item banner--03">
          <img src="/src/beliefs/assets/clean_blank_banner_03.png" className="belief-banner-bg" alt="" aria-hidden="true" />
          <div className="belief-banner-content">
            <span className="belief-banner-num">03</span>
            <div className="belief-banner-divider"></div>
            <div className="belief-banner-text">
              <h3 className="belief-banner-title">People before algorithms.</h3>
              <p className="belief-banner-desc">We design for human emotion and connection, not just search engine web crawlers.</p>
            </div>
          </div>
        </div>

        {/* 04 Design With A Reason */}
        <div className="belief-banner-item banner--04">
          <img src="/src/beliefs/assets/clean_blank_banner_04.png" className="belief-banner-bg" alt="" aria-hidden="true" />
          <div className="belief-banner-content">
            <span className="belief-banner-num">04</span>
            <div className="belief-banner-divider"></div>
            <div className="belief-banner-text">
              <h3 className="belief-banner-title"><span className="title-accent">Design</span> with a reason.</h3>
              <p className="belief-banner-desc">Every font choice, margin, and color decision serves a specific business purpose.</p>
            </div>
          </div>
        </div>

        {/* 05 Build For What Comes Next */}
        <div className="belief-banner-item banner--05">
          <img src="/src/beliefs/assets/clean_blank_banner_05.png" className="belief-banner-bg" alt="" aria-hidden="true" />
          <div className="belief-banner-content">
            <span className="belief-banner-num">05</span>
            <div className="belief-banner-divider"></div>
            <div className="belief-banner-text">
              <h3 className="belief-banner-title">Build for what comes next.</h3>
              <p className="belief-banner-desc">Identities and platforms engineered to scale seamlessly as your business expands.</p>
            </div>
          </div>
        </div>

        {/* Botanical Accent: Olive sprig with tape */}
        <img
          src="/src/beliefs/assets/olive_sprig_with_masking_tape.png"
          className="belief-asset belief-botanical--olive"
          alt=""
          aria-hidden="true"
        />
      </div>

      </div>
    </section>
  );
};

export default BeliefsPage;
