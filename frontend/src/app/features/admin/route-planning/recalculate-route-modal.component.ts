import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RecalculateTarget } from '../../../core/services/route-planning.service';

@Component({
  selector: 'app-recalculate-route-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './recalculate-route-modal.component.html',
  styleUrl: './recalculate-route-modal.component.css'
})
export class RecalculateRouteModalComponent {
  @Output() close = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<{ target: RecalculateTarget; allowReassign: boolean }>();

  target = signal<RecalculateTarget>('distance');
  allowReassign = signal(true);

  select(t: RecalculateTarget) {
    this.target.set(t);
  }

  toggleReassign() {
    this.allowReassign.update(v => !v);
  }

  onConfirm() {
    this.confirmed.emit({ target: this.target(), allowReassign: this.allowReassign() });
  }
}
