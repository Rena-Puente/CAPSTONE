import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonContent,
  IonFooter,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonTextarea,
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';

import { ApplyJobPayload } from '../../../core/services/job.service';
import { Job, JobQuestion } from '../../../core/models';

@Component({
  selector: 'app-apply-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonInput, IonTextarea, IonButton, IonFooter],
  template: `
    <ion-modal
      [isOpen]="open"
      (willDismiss)="close.emit()"
      [presentingElement]="presentingElement"
      [backdropDismiss]="true"
      [canDismiss]="true"
    >
      <ng-container *ngIf="open">
        <ion-header>
          <ion-toolbar color="primary">
            <ion-title>Postular a {{ job?.title }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <div class="modal-content">
            <ion-item>
              <ion-label position="stacked">Carta de presentación</ion-label>
              <ion-textarea
                auto-grow="true"
                placeholder="Comparte un breve resumen"
                [(ngModel)]="coverLetter"
              ></ion-textarea>
            </ion-item>

            <ion-list *ngIf="job?.questions?.length">
              <ion-item lines="inset" *ngFor="let question of job?.questions; let i = index">
                <ion-label position="stacked">
                  {{ question.text }}
                  <span *ngIf="question.required" class="required">*</span>
                </ion-label>
                <ion-input
                  [required]="question.required"
                  [(ngModel)]="answers[i]"
                  placeholder="Tu respuesta"
                ></ion-input>
              </ion-item>
            </ion-list>
          </div>
        </ion-content>

        <ion-footer>
          <ion-toolbar>
            <ion-button expand="block" (click)="submit()" [disabled]="submitting">
              {{ submitting ? 'Enviando...' : 'Enviar postulación' }}
            </ion-button>
            <ion-button expand="block" color="medium" fill="clear" (click)="close.emit()">
              Cancelar
            </ion-button>
          </ion-toolbar>
        </ion-footer>
      </ng-container>
    </ion-modal>
  `,
  styles: [
    `
      .modal-content {
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .required {
        color: var(--ion-color-danger);
        margin-left: 0.25rem;
      }
    `,
  ],
})
export class ApplyModalComponent implements OnChanges {
  @Input() job: Job | null = null;
  @Input() open = false;
  @Input() submitting = false;
  @Input() presentingElement: HTMLElement | null = null;

  @Output() submitApplication = new EventEmitter<ApplyJobPayload>();
  @Output() close = new EventEmitter<void>();

  protected coverLetter: string | null = null;
  protected answers: string[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      this.resetForm();
    }

    if (changes['job'] && this.open) {
      this.initializeAnswers();
    }
  }

  protected submit(): void {
    if (!this.job) {
      return;
    }

    const payload: ApplyJobPayload = {
      coverLetter: this.coverLetter ?? '',
      answers: this.job.questions?.map((question: JobQuestion, index: number) => ({
        question: question.text,
        answer: this.answers[index] ?? '',
      })),
    };

    this.submitApplication.emit(payload);
  }

  private resetForm(): void {
    this.coverLetter = '';
    this.initializeAnswers();
  }

  private initializeAnswers(): void {
    if (this.job?.questions?.length) {
      this.answers = new Array(this.job.questions.length).fill('');
    } else {
      this.answers = [];
    }
  }
}
