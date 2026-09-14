import { environment } from '../../environments/environment';
import { classifyBackendRequest } from './backend-request.util';

describe('authenticated backend request classification', () => {
  const backend = environment.backendUrl.replace(/\/+$/u, '');

  it('classifies backend API and private file routes as authenticated', () => {
    for (const url of [
      `${backend}/api/users/me`,
      `${backend}/files/submissions/test.jpg`,
      `${backend}/uploads/submissions/test.jpg`,
      `${backend}/uploads/feedback/test.pdf`,
      `${backend}/uploads/assignments/test.pdf`,
      `${backend}/uploads/original/test.pdf`,
      `${backend}/uploads/processed/test.pdf`,
      `${backend}/upload`,
      '/api/users/me',
      '/files/submissions/file.jpg?x=1#preview',
      '/uploads/submissions/file.jpg'
    ]) expect(classifyBackendRequest(url).access).toBe('authenticated');
  });

  it('keeps presentation upload routes public', () => {
    for (const path of [
      '/uploads/avatars/avatar.jpg',
      '/uploads/class-banners/banner.jpg',
      '/uploads/flashcards/card.jpg',
      '/uploads/templates/template.jpg'
    ]) expect(classifyBackendRequest(`${backend}${path}?v=1`).access).toBe('public');
  });

  it('fails closed for external, deceptive, protocol-relative, and malformed URLs', () => {
    for (const url of [
      'https://example.com/api/users/me',
      `https://evil.example/?next=${encodeURIComponent(`${backend}/api/users/me`)}`,
      `//evil.example/files/submissions/file.jpg`,
      'https://[malformed/files/submissions/file.jpg',
      `${backend}.evil.example/api/users/me`,
      `javascript:${backend}/api/users/me`,
      ` ${backend}/api/users/me`
    ]) expect(classifyBackendRequest(url).access).toBe('external');
  });

  it('does not use broad path-prefix or substring matches', () => {
    expect(classifyBackendRequest(`${backend}/apiary/users`).access).toBe('external');
    expect(classifyBackendRequest(`${backend}/uploads/avatars-private/file.jpg`).access).toBe('external');
    expect(classifyBackendRequest(`${backend}/redirect?next=/files/submissions/file.jpg`).access).toBe('external');
  });

  it('uses the configured production origin without any localhost assumption', () => {
    const productionBackend = 'https://comarkerback.roznahub.com';
    expect(classifyBackendRequest(`${productionBackend}/files/submissions/file.jpg`, productionBackend).access)
      .toBe('authenticated');
    expect(classifyBackendRequest('http://localhost:5000/files/submissions/file.jpg', productionBackend).access)
      .toBe('external');
  });
});
