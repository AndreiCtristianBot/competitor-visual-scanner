declare module 'wcag-contrast' {
  const WCAGContrast: {
    // funcția folosită în cod: hex(foreground, background) => contrast ratio (number)
    hex(foreground: string, background: string): number;
    // poți adăuga alte semnături folosite din pachet, ex:
    // rgb(foregroundRgb: string, backgroundRgb: string): number;
  };

  export default WCAGContrast;
}