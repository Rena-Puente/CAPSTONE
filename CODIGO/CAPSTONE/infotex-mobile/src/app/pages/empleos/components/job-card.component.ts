import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonIcon,
  IonItem,
  IonLabel
} from '@ionic/angular/standalone';
import { heartOutline, heartSharp, eyeOutline, createOutline, trashOutline } from 'ionicons/icons';
import { addIcons } from 'ionicons';

import { Job } from '../../../core/models';

addIcons({ heartOutline, heartSharp, eyeOutline, createOutline, trashOutline });

@Component({
  selector: 'app-job-card',
  standalone: true,
  imports: [CommonModule, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonButton, IonIcon, IonItem, IonLabel],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ job?.title || 'Oferta sin título' }}</ion-card-title>
        <ion-card-subtitle>
          {{ job?.company?.name || 'Empresa no disponible' }}
        </ion-card-subtitle>
      </ion-card-header>

      <ion-card-content>
        <ion-item lines="none">
          <ion-label>
            <div class="location">
              {{ job?.city || 'Ubicación no especificada' }}
              <ng-container *ngIf="job?.country"> - {{ job?.country }}</ng-container>
            </div>
            <div class="meta">
              <span>{{ job?.seniority || 'Seniority no definido' }}</span>
              <span>•</span>
              <span>{{ job?.contractType || 'Contrato no definido' }}</span>
            </div>
          </ion-label>
        </ion-item>

        <div class="actions">
          <ion-button fill="outline" size="small" (click)="view.emit(job)">
            <ion-icon slot="start" name="eye-outline"></ion-icon>
            Ver detalle
          </ion-button>

          <ion-button
            *ngIf="showFavorite"
            fill="clear"
            size="small"
            color="danger"
            (click)="favoriteChange.emit(job)"
          >
            <ion-icon slot="icon-only" [name]="favorite ? 'heart-sharp' : 'heart-outline'"></ion-icon>
          </ion-button>
        </div>

        <div class="footer-actions">
          <ion-button *ngIf="showApply" expand="block" (click)="apply.emit(job)" [disabled]="disabled">
            {{ applied ? 'Postulación enviada' : 'Postular' }}
          </ion-button>

          <div *ngIf="showManageActions" class="manage-actions">
            <ion-button size="small" color="medium" fill="outline" (click)="toggleActive.emit(job)">
              <ion-icon slot="start" name="create-outline"></ion-icon>
              {{ job?.active ? 'Desactivar' : 'Activar' }}
            </ion-button>
            <ion-button size="small" color="danger" fill="outline" (click)="remove.emit(job)">
              <ion-icon slot="start" name="trash-outline"></ion-icon>
              Eliminar
            </ion-button>
          </div>
        </div>
      </ion-card-content>
    </ion-card>
  `,
  styles: [
    `
      ion-card-title {
        font-size: 1.2rem;
      }

      .meta {
        display: flex;
        gap: 0.5rem;
        color: var(--ion-color-medium);
        font-size: 0.9rem;
      }

      .actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 0.75rem 0;
      }

      .footer-actions {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .manage-actions {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
      }
    `,
  ],
})
export class JobCardComponent {
  @Input() job!: Job;
  @Input() favorite = false;
  @Input() applied = false;
  @Input() disabled = false;
  @Input() showApply = true;
  @Input() showFavorite = true;
  @Input() showManageActions = false;

  @Output() apply = new EventEmitter<Job>();
  @Output() favoriteChange = new EventEmitter<Job>();
  @Output() view = new EventEmitter<Job>();
  @Output() toggleActive = new EventEmitter<Job>();
  @Output() remove = new EventEmitter<Job>();
}
