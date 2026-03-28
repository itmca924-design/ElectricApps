import { Directive, ElementRef, HostListener, Input, OnInit, Renderer2, Output, EventEmitter, NgZone } from '@angular/core';

@Directive({
  selector: '[appResizableColumn]',
  standalone: true
})
export class ResizableColumnDirective implements OnInit {
  @Input('appResizableColumn') set resizable(value: any) {
    this._resizable = value === '' || value === true || value === 'true';
  }
  private _resizable = true;
  @Input() minWidth = 50;
  @Output() resized = new EventEmitter<number>();

  private startX: number = 0;
  private startWidth: number = 0;
  private resizer: HTMLElement | null = null;

  private isResizing = false;
  private animationFrameId: number | null = null;

  constructor(private el: ElementRef, private renderer: Renderer2, private ngZone: NgZone) {}

  ngOnInit() {
    if (!this._resizable) return;

    // Ensure parent is relative for resizer positioning
    this.renderer.setStyle(this.el.nativeElement, 'position', 'relative');

    // Create the resizer element
    this.resizer = this.renderer.createElement('div');
    this.renderer.addClass(this.resizer, 'column-resizer');
    this.renderer.appendChild(this.el.nativeElement, this.resizer);

    // Add pointer events for dragging
    this.renderer.listen(this.resizer, 'mousedown', (event: MouseEvent) => {
      this.onMouseDown(event);
    });
  }

  private onMouseDown(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    this.startX = event.pageX;
    this.startWidth = this.el.nativeElement.offsetWidth;
    this.isResizing = true;

    // Add document-level listeners for move and up outside NgZone
    this.ngZone.runOutsideAngular(() => {
      const mouseMoveListener = this.onMouseMove.bind(this);
      const mouseUpListener = (e: MouseEvent) => {
        this.onMouseUp(mouseMoveListener);
      };

      document.addEventListener('mousemove', mouseMoveListener);
      document.addEventListener('mouseup', mouseUpListener, { once: true });
    });
    
    this.renderer.addClass(document.body, 'resizing-active');
  }

  private onMouseMove(event: MouseEvent) {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.animationFrameId = requestAnimationFrame(() => {
      const deltaX = event.pageX - this.startX;
      const newWidth = Math.max(this.minWidth, this.startWidth + deltaX);
      
      // Apply width directly to native element for maximum speed
      this.el.nativeElement.style.width = `${newWidth}px`;
      this.el.nativeElement.style.minWidth = `${newWidth}px`;
      this.el.nativeElement.style.maxWidth = `${newWidth}px`;
      
      this.resized.emit(newWidth);
    });
  }

  private onMouseUp(moveListener: any) {
    this.isResizing = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    document.removeEventListener('mousemove', moveListener);
    this.ngZone.run(() => {
      this.renderer.removeClass(document.body, 'resizing-active');
    });
  }
}
