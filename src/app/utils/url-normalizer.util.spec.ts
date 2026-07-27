import { environment } from '../../environments/environment';
import { normalizeAssetUrls, normalizeToHttps } from './url-normalizer.util';

describe('canonical asset URL normalization', () => {
  const original = { ...environment };

  afterEach(() => Object.assign(environment, original));

  it('resolves backend-relative uploads against the configured backend exactly once', () => {
    Object.assign(environment, { production: true, apiUrl: 'https://comarkerback.roznahub.com' });
    expect(normalizeToHttps('/uploads/submissions/page-1.jpg'))
      .toBe('https://comarkerback.roznahub.com/uploads/submissions/page-1.jpg');
    expect(normalizeToHttps('https://comarkerback.roznahub.com/uploads/submissions/page-1.jpg'))
      .toBe('https://comarkerback.roznahub.com/uploads/submissions/page-1.jpg');
  });

  it('repairs legacy localhost and private-network upload URLs in production', () => {
    Object.assign(environment, { production: true, apiUrl: 'https://comarkerback.roznahub.com' });
    expect(normalizeToHttps('http://localhost:5000/uploads/submissions/page-1.jpg'))
      .toBe('https://comarkerback.roznahub.com/uploads/submissions/page-1.jpg');
    expect(normalizeToHttps('http://192.168.1.8:5000/uploads/submissions/page-2.jpg'))
      .toBe('https://comarkerback.roznahub.com/uploads/submissions/page-2.jpg');
  });

  it('preserves local development and external safe asset URLs', () => {
    Object.assign(environment, { production: false, apiUrl: 'http://localhost:5000' });
    expect(normalizeToHttps('/uploads/submissions/page-1.jpg'))
      .toBe('http://localhost:5000/uploads/submissions/page-1.jpg');
    expect(normalizeToHttps('http://localhost:5000/uploads/submissions/page-1.jpg'))
      .toBe('http://localhost:5000/uploads/submissions/page-1.jpg');
    expect(normalizeToHttps('https://images.unsplash.com/photo-1')).toBe('https://images.unsplash.com/photo-1');
    expect(normalizeToHttps('blob:https://comarkers.roznahub.com/id')).toBe('blob:https://comarkers.roznahub.com/id');
    expect(normalizeToHttps('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  it('normalizes the shared main-image and thumbnail array without double-prefixing', () => {
    Object.assign(environment, { production: true, apiUrl: 'https://comarkerback.roznahub.com' });
    expect(normalizeAssetUrls([
      'http://127.0.0.1:5000/uploads/submissions/page-1.jpg',
      '/uploads/submissions/page-2.jpg',
      'https://comarkerback.roznahub.com/uploads/submissions/page-3.jpg'
    ])).toEqual([
      'https://comarkerback.roznahub.com/uploads/submissions/page-1.jpg',
      'https://comarkerback.roznahub.com/uploads/submissions/page-2.jpg',
      'https://comarkerback.roznahub.com/uploads/submissions/page-3.jpg'
    ]);
  });
});
