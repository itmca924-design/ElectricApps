import { Directive, ElementRef, HostListener, Input, OnInit, Renderer2, Output, EventEmitter } from '@angular/core';

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

  constructor(private el: ElementRef, private renderer: Renderer2) {}

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

    // Add document-level listeners for move and up
    const mouseMoveListener = this.onMouseMove.bind(this);
    const mouseUpListener = this.onMouseUp.bind(this, mouseMoveListener);

    document.addEventListener('mousemove', mouseMoveListener);
    document.addEventListener('mouseup', mouseUpListener, { once: true });
    
    this.renderer.addClass(document.body, 'resizing-active');
  }

  private onMouseMove(event: MouseEvent) {
    const deltaX = event.pageX - this.startX;
    const newWidth = Math.max(this.minWidth, this.startWidth + deltaX);
    
    // Apply width to the header element
    this.renderer.setStyle(this.el.nativeElement, 'width', `${newWidth}px`);
    this.renderer.setStyle(this.el.nativeElement, 'min-width', `${newWidth}px`);
    this.renderer.setStyle(this.el.nativeElement, 'max-width', `${newWidth}px`);
    
    this.resized.emit(newWidth);
  }

  private onMouseUp(moveListener: any) {
    document.removeEventListener('mousemove', moveListener);
    this.renderer.removeClass(document.body, 'resizing-active');
  }
}
