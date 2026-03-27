import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PrintSettings } from './print-settings';

describe('PrintSettings', () => {
  let component: PrintSettings;
  let fixture: ComponentFixture<PrintSettings>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrintSettings]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PrintSettings);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
