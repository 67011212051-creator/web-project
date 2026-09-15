import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { JobService } from '../../../core/services/job.service';

@Component({
  selector: 'app-job-lookup-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './job-lookup-page.component.html',
  styleUrl: './job-lookup-page.component.css'
})
export class JobLookupPageComponent {
  jobCodeInput = signal('JOB-240913-R1');
  notFound = signal(false);

  constructor(public jobService: JobService, private router: Router) {}

  onLookup() {
    const job = this.jobService.getJobByCode(this.jobCodeInput().trim());
    if (job) {
      this.notFound.set(false);
      this.router.navigate(['/rider/job', job.code]);
    } else {
      this.notFound.set(true);
    }
  }

  totalBoxesText(): string {
    return this.jobService.job().totalBoxes + ' กล่อง';
  }
}
