import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { QrGeneratorService } from './qr-generator.service';
import { QrScannerService } from './qr-scanner.service';
import { CacheService } from './cache.service';
import { ErrorHandlerService } from './error-handler.service';

describe('Class Management Services', () => {
  let qrGenerator: QrGeneratorService;
  let cache: CacheService;
  let errorHandler: ErrorHandlerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        QrGeneratorService,
        CacheService,
        ErrorHandlerService
      ]
    });

    qrGenerator = TestBed.inject(QrGeneratorService);
    cache = TestBed.inject(CacheService);
    errorHandler = TestBed.inject(ErrorHandlerService);
  });

  describe('QrGeneratorService', () => {
    it('should generate valid class join URL', () => {
      const joinCode = 'ABC123';
      const url = qrGenerator.generateClassJoinUrl(joinCode);
      
      expect(url).toContain('joinCode=' + joinCode);
      expect(url).toContain('/student/join-class?');
    });

    it('should validate join codes correctly', () => {
      expect(qrGenerator.validateJoinCode('ABC123')).toBe(true);
      expect(qrGenerator.validateJoinCode('AB12')).toBe(false); // Too short
      expect(qrGenerator.validateJoinCode('ABC123!')).toBe(false); // Invalid character
      expect(qrGenerator.validateJoinCode('')).toBe(false); // Empty
    });

    it('should extract join code from URL', () => {
      const url = 'https://example.com/student/join-class?joinCode=ABC123';
      const extracted = qrGenerator.extractJoinCodeFromUrl(url);
      
      expect(extracted).toBe('ABC123');
    });

    it('should handle direct join codes', () => {
      const joinCode = 'ABC123';
      const extracted = qrGenerator.extractJoinCodeFromUrl(joinCode);
      
      expect(extracted).toBe('ABC123');
    });
  });

  describe('CacheService', () => {
    it('should store and retrieve data', () => {
      const key = 'test-key';
      const data = { test: 'data' };
      
      cache.set(key, data);
      const retrieved = cache.get(key);
      
      expect(retrieved).toEqual(data);
    });

    it('should return null for expired items', (done) => {
      const key = 'test-key-expire';
      const data = { test: 'data' };
      
      // Set with very short TTL
      cache.set(key, data, 1);
      
      setTimeout(() => {
        const retrieved = cache.get(key);
        expect(retrieved).toBeNull();
        done();
      }, 10);
    });

    it('should check if key exists', () => {
      const key = 'test-key-exists';
      const data = { test: 'data' };
      
      expect(cache.has(key)).toBe(false);
      
      cache.set(key, data);
      expect(cache.has(key)).toBe(true);
    });

    it('should delete items', () => {
      const key = 'test-key-delete';
      const data = { test: 'data' };
      
      cache.set(key, data);
      expect(cache.has(key)).toBe(true);
      
      cache.delete(key);
      expect(cache.has(key)).toBe(false);
    });

    it('should clear all items', () => {
      cache.set('key1', 'data1');
      cache.set('key2', 'data2');
      
      expect(cache.size()).toBe(2);
      
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe('ErrorHandlerService', () => {
    it('should handle network errors gracefully', () => {
      const error = { message: 'Network error' };
      const context = { operation: 'Test Operation' };
      
      spyOn(console, 'error');
      
      errorHandler.handleError(error, context);
      
      expect(console.error).toHaveBeenCalledWith('Error in Test Operation:', error, context);
    });

    it('should provide user-friendly messages', () => {
      const error = { status: 404 };
      const context = { operation: 'Test Operation' };
      
      spyOn(console, 'error');
      
      errorHandler.handleError(error, context);
      
      expect(console.error).toHaveBeenCalled();
    });
  });
});

describe('Integration Tests', () => {
  it('should handle complete QR scan workflow', () => {
    const qrGenerator = new QrGeneratorService();
    const cache = new CacheService();
    
    // Simulate QR scan workflow
    const joinCode = 'TEST123';
    const qrUrl = qrGenerator.generateClassJoinUrl(joinCode);
    const extractedCode = qrGenerator.extractJoinCodeFromUrl(qrUrl);
    
    expect(extractedCode).toBe(joinCode);
    expect(qrGenerator.validateJoinCode(extractedCode)).toBe(true);
  });

  it('should handle search with caching', () => {
    const cache = new CacheService();
    
    // Simulate search results caching
    const searchResults = [
      { id: '1', title: 'Math Class' },
      { id: '2', title: 'Science Class' }
    ];
    
    cache.set('search-math', searchResults);
    const cached = cache.get('search-math');
    
    expect(cached).toEqual(searchResults);
    expect(cached).toHaveLength(2);
  });
});
