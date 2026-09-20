/** Public contact details shared by the website and customer emails. */
export const businessContact = {
  email: 'hello@carolinahomekeeping.com',
  mailingStreet: '6210 Old US Hwy 70 W',
  mailingCityStateZip: 'New Bern, NC 28562',
  phone: '252-515-4389',
  phoneE164: '+12525154389',
  phoneHref: 'tel:+12525154389',
  hours: [
    {days:'Thursday & Sunday',times:'8 AM–5 PM'},
    {days:'Other days',times:'Unavailable'},
  ],
} as const;
