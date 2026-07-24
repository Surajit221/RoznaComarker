import { COMPACT_VIEW_QUERY, classifyDeviceWidth } from './device.service';

describe('DeviceService breakpoint policy', () => {
  it('uses one inclusive compact boundary through 1024px', () => {
    expect(classifyDeviceWidth(768)).toBe('mobile');
    expect(classifyDeviceWidth(769)).toBe('tablet');
    expect(classifyDeviceWidth(1024)).toBe('tablet');
    expect(classifyDeviceWidth(1025)).toBe('desktop');
    expect(COMPACT_VIEW_QUERY).toBe('(max-width: 1024px)');
  });
});
