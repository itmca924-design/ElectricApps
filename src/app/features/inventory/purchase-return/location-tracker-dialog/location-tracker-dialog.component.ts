
import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../../shared/material/material/material-module';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-location-tracker-dialog',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  template: `
    <div class="location-tracker-container">
      <div class="header">
        <div class="title-section">
          <mat-icon class="pulse-icon">location_on</mat-icon>
          <div>
            <h3>Live Inventory Tracker</h3>
            <p>Precise warehouse positioning</p>
          </div>
        </div>
        <button mat-icon-button (click)="dialogRef.close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="content">
        <div class="map-visual">
          <div class="warehouse-grid">
            <div class="grid-cell" *ngFor="let i of [1,2,3,4,5,6,7,8,9,10,11,12]">
              <div class="cell-content" [class.active]="i === activeIndex">
                <span *ngIf="i === activeIndex" class="marker">
                  <mat-icon>inventory</mat-icon>
                </span>
                <small>{{getLabel(i)}}</small>
              </div>
            </div>
          </div>
          <div class="status-overlay">
             <div class="status-badge live">
               <span class="dot"></span> LIVE VIEW
             </div>
          </div>
        </div>

        <div class="info-card">
          <div class="info-item">
            <label>Warehouse</label>
            <div class="value">{{data.warehouseName}}</div>
          </div>
          <div class="info-item">
            <label>Rack / Shelf</label>
            <div class="value">{{data.rackName}}</div>
          </div>
          <div class="info-item">
            <label>Current Status</label>
            <div class="value status-ok">In Stock & Verified</div>
          </div>
        </div>

        <div class="description-box" *ngIf="data.description">
          <label>Warehouse Note:</label>
          <p>{{data.description}}</p>
        </div>
      </div>

      <div class="footer">
        <button mat-raised-button color="primary" (click)="dialogRef.close()">
           Got it
        </button>
      </div>
    </div>
  `,
  styles: [`
    .location-tracker-container {
      padding: 0;
      overflow: hidden;
      font-family: 'Inter', sans-serif;
    }

    .header {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: white;
      padding: 20px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;

      .title-section {
        display: flex;
        align-items: center;
        gap: 16px;

        h3 { margin: 0; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.5px; }
        p { margin: 0; font-size: 0.8rem; opacity: 0.7; }
      }

      .pulse-icon {
        background: rgba(255,255,255,0.1);
        padding: 8px;
        border-radius: 50%;
        color: #3b82f6;
        animation: pulse-bg 2s infinite;
      }
    }

    @keyframes pulse-bg {
      0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
      70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
      100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
    }

    .content {
      padding: 24px;
      background: #f8fafc;
    }

    .map-visual {
      height: 200px;
      background: #e2e8f0;
      border-radius: 12px;
      margin-bottom: 24px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #cbd5e1;
      overflow: hidden;

      .warehouse-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        width: 100%;
        padding: 12px;
        height: 100%;

        .grid-cell {
          background: white;
          border-radius: 6px;
          border: 1px solid #dee2e6;
          display: flex;
          align-items: center;
          justify-content: center;
          
          .cell-content {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-size: 0.6rem;
            color: #94a3b8;

            &.active {
              background: #dbeafe;
              border: 2px solid #3b82f6;
              color: #2563eb;
              position: relative;

              .marker {
                transform: translateY(-2px);
                animation: float 2s infinite ease-in-out;
                mat-icon { font-size: 24px; width: 24px; height: 24px; }
              }
            }
          }
        }
      }

      .status-overlay {
        position: absolute;
        top: 12px;
        right: 12px;

        .status-badge {
          background: rgba(15, 23, 42, 0.8);
          color: white;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 0.65rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 6px;
          backdrop-filter: blur(4px);

          .dot {
            width: 6px;
            height: 6px;
            background: #22c55e;
            border-radius: 50%;
            display: inline-block;
            box-shadow: 0 0 8px #22c55e;
            animation: blink 1s infinite;
          }
        }
      }
    }

    @keyframes blink {
      0% { opacity: 1; }
      50% { opacity: 0.3; }
      100% { opacity: 1; }
    }

    @keyframes float {
      0%, 100% { transform: translateY(-2px); }
      50% { transform: translateY(-6px); }
    }

    .info-card {
      display: flex;
      gap: 16px;
      background: white;
      padding: 16px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      margin-bottom: 20px;

      .info-item {
        flex: 1;
        label { font-size: 0.65rem; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 4px; }
        .value { font-size: 0.9rem; font-weight: 700; color: #1e293b; }
        .status-ok { color: #16a34a; }
      }
    }

    .description-box {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      padding: 12px 16px;
      border-radius: 8px;

      label { font-size: 0.75rem; font-weight: 700; color: #92400e; margin-bottom: 4px; display: block; }
      p { margin: 0; font-size: 0.85rem; color: #78350f; line-height: 1.5; }
    }

    .footer {
      padding: 16px 24px;
      background: white;
      border-top: 1px solid #f1f5f9;
      text-align: right;

      button {
        border-radius: 20px;
        padding: 0 24px;
        font-weight: 600;
      }
    }
  `]
})
export class LocationTrackerDialogComponent {
  activeIndex: number = 5;
  prefix: string = 'B';

  constructor(
    public dialogRef: MatDialogRef<LocationTrackerDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.calculateActiveIndex();
  }

  calculateActiveIndex() {
    const rackName = this.data.rackName || '';

    // 1. Try to extract number from rack name (e.g., "Bin 7" -> 7, "Rack A2" -> 2)
    const numMatch = rackName.match(/\d+/);
    if (numMatch) {
      const num = parseInt(numMatch[0]);
      this.activeIndex = (num % 12) || 12;
    } else {
      // Fallback: Use string hashing of Product ID or name to get a stable 1-12 index
      const seedSource = (this.data.productId || rackName).toString();
      let hash = 0;
      for (let i = 0; i < seedSource.length; i++) {
        hash = ((hash << 5) - hash) + seedSource.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
      }
      this.activeIndex = (Math.abs(hash) % 12) + 1;
    }

    // 2. Smarter Prefix: Skip common words like "Rack", "Work", "Bench"
    // We look for capital letters that are likely Zone identifiers
    const cleanName = rackName.replace(/Rack|Work|Bench|Warehouse|Bin|Shelf|Floor/gi, '').trim();
    const prefixMatch = cleanName.match(/[A-Z]/);

    if (prefixMatch) {
      this.prefix = prefixMatch[0];
    } else {
      // Final fallback to the first capital letter of the original name if clean version has none
      const originalMatch = rackName.match(/[A-Z]/);
      this.prefix = originalMatch ? originalMatch[0] : 'B';
    }
  }

  getLabel(i: number): string {
    return `${this.prefix}-${i}`;
  }
}
