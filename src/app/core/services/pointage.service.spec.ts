import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { PointageService } from './pointage.service';

describe('PointageService', () => {
  let service: PointageService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(PointageService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('envoie le pointage QR avec la clé de dispositif', () => {
    const payload = { type_pointage: 'entree' as const, matricule: 'A123' };

    service.pointer('qr', payload, 'device-key').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/pointage/qr`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-Device-Key')).toBe('device-key');
    expect(req.request.body).toEqual(payload);
    req.flush({ pointage: { id_pointage: 1 }, anomalie_detectee: null });
  });
});
