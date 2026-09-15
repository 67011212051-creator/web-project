import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-check-before-calculate-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './check-before-calculate-modal.component.html',
  styleUrl: './check-before-calculate-modal.component.css'
})
export class CheckBeforeCalculateModalComponent {
  @Output() close = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<void>();
}
