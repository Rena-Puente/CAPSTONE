import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  CompanyService,
  CompanyApplicant,
  CompanyOfferSummary
} from '../../services/company.service';

interface ApplicantResponseRow {
  id: string;
  question: string;
  required: boolean;
  answer: string | null;
}

@Component({
  selector: 'app-company-applicants',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './company-applicants.html',
  styleUrl: './company-applicants.css'
})
export class CompanyApplicants {
  private readonly companyService = inject(CompanyService);
  private readonly document = inject(DOCUMENT, { optional: true }) as Document | null;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly applicants = signal<CompanyApplicant[]>([]);
  protected readonly offers = signal<CompanyOfferSummary[]>([]);
  protected readonly selectedOfferId = signal<number | null>(null);
  protected readonly selectedOffer = computed<CompanyOfferSummary | null>(() => {
    const selectedId = this.selectedOfferId();

    if (selectedId === null) {
      return null;
    }

    if (!Number.isInteger(selectedId)) {
      return null;
    }

    return this.offers().find((offer) => offer.id === selectedId) ?? null;
  });
  protected readonly updatingOfferState = signal(false);
  protected readonly deletingOffer = signal(false);
  protected readonly offerActionError = signal<string | null>(null);
  protected readonly offerActionMessage = signal<string | null>(null);
  protected readonly selectedApplicant = signal<CompanyApplicant | null>(null);
  protected readonly isFormModalOpen = signal(false);
  protected readonly selectedApplicantResponses = computed<ApplicantResponseRow[]>(() => {
    const applicant = this.selectedApplicant();

    if (!applicant) {
      return [];
    }

    const questions = applicant.questions ?? [];
    const answers = applicant.answers ?? [];
    const totalRows = Math.max(questions.length, answers.length);

    if (totalRows === 0) {
      return [];
    }

    return Array.from({ length: totalRows }, (_, index) => {
      const questionText =
        questions[index]?.text || answers[index]?.question || `Pregunta ${index + 1}`;
      const required = Boolean(questions[index]?.required);
      const answer = answers[index]?.answer ?? null;

      return {
        id: `${applicant.applicationId}-${index}`,
        question: questionText,
        required,
        answer
      } satisfies ApplicantResponseRow;
    });
  });

    protected formatOfferOption(offer: CompanyOfferSummary | null): string {
    if (!offer) {
      return 'Oferta sin título';
    }

    const title = offer.title?.trim() || `Oferta #${offer.id}`;
    const statusLabel = offer.active ? 'activo' : 'inactivo';
    const totalApplicants =
      typeof offer.totalApplicants === 'number' && Number.isFinite(offer.totalApplicants)
        ? offer.totalApplicants
        : 0;
    const applicantsLabel = totalApplicants === 1 ? '1 postulante' : `${totalApplicants} postulantes`;

    return `${title} (${statusLabel}) · ${applicantsLabel}`;
  }
  constructor() {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.loadOffers();
  }

  private async loadOffers(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.offers.set([]);
    this.offerActionError.set(null);
    this.offerActionMessage.set(null);

    let offerToAutoload: number | null = null;

    try {
      const offers = await firstValueFrom(this.companyService.listMyOffers());
      this.offers.set(offers);

      const currentlySelectedOfferId = this.selectedOfferId();

      if (currentlySelectedOfferId !== null) {
        const stillExists = offers.some((offer) => offer.id === currentlySelectedOfferId);

        if (!stillExists) {
          this.selectedOfferId.set(null);
          this.applicants.set([]);
        }
      }

      if (offers.length === 0) {
        this.selectedOfferId.set(null);
        this.applicants.set([]);
      }

      if (offers.length === 1) {
        const firstOfferId = offers[0]?.id;

        if (Number.isInteger(firstOfferId) && firstOfferId > 0) {
          this.selectedOfferId.set(firstOfferId);
          offerToAutoload = firstOfferId;
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudieron obtener las ofertas de la empresa.';
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }

    if (offerToAutoload !== null) {
      await this.loadApplicantsForOffer(offerToAutoload);
    }
  }

  protected async onOfferSelected(event: Event): Promise<void> {
    const target = event.target as HTMLSelectElement | null;
    const value = target?.value ?? '';

    this.offerActionError.set(null);
    this.offerActionMessage.set(null);

    if (!value) {
      this.selectedOfferId.set(null);
      this.applicants.set([]);
      return;
    }

    const offerId = Number.parseInt(value, 10);

    if (!Number.isInteger(offerId) || offerId <= 0) {
      this.selectedOfferId.set(null);
      this.applicants.set([]);
      return;
    }

    this.selectedOfferId.set(offerId);
    await this.loadApplicantsForOffer(offerId);
  }

  protected async onOfferActiveToggled(event: Event, offer: CompanyOfferSummary | null): Promise<void> {
    if (!offer || !Number.isInteger(offer.id) || offer.id <= 0) {
      return;
    }

    const input = event.target as HTMLInputElement | null;

    if (!input) {
      return;
    }

    const desiredState = input.checked;
    const previousState = offer.active;

    if (desiredState === previousState) {
      return;
    }

    this.updatingOfferState.set(true);
    this.offerActionError.set(null);
    this.offerActionMessage.set(null);

    try {
      const result = await firstValueFrom(this.companyService.updateOfferActiveState(offer.id, desiredState));

      this.offers.update((current) =>
        current.map((item) => (item.id === offer.id ? { ...item, active: result.active } : item))
      );

      const message = result.message ?? (result.active ? 'La oferta se activó correctamente.' : 'La oferta se desactivó correctamente.');
      this.offerActionMessage.set(message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo actualizar el estado de la oferta.';

      this.offerActionError.set(message);
      input.checked = previousState;
    } finally {
      this.updatingOfferState.set(false);
    }
  }

  protected async onDeleteOffer(offer: CompanyOfferSummary | null): Promise<void> {
    if (!offer || !Number.isInteger(offer.id) || offer.id <= 0) {
      return;
    }

    const confirmationMessage =
      '¿Seguro que quieres eliminar esta oferta? Esta acción no se puede deshacer.';
    const defaultView = this.document?.defaultView;

    if (defaultView && typeof defaultView.confirm === 'function') {
      const confirmed = defaultView.confirm(confirmationMessage);

      if (!confirmed) {
        return;
      }
    }

    this.deletingOffer.set(true);
    this.offerActionError.set(null);
    this.offerActionMessage.set(null);

    try {
      const result = await firstValueFrom(this.companyService.deleteOffer(offer.id));

      const remainingOffers = this.offers().filter((item) => item.id !== offer.id);

      this.offers.set(remainingOffers);

      const selectedId = this.selectedOfferId();

      if (selectedId === offer.id) {
        this.selectedOfferId.set(null);
        this.applicants.set([]);

        const nextOffer = remainingOffers[0] ?? null;

        if (nextOffer && Number.isInteger(nextOffer.id) && nextOffer.id > 0) {
          this.selectedOfferId.set(nextOffer.id);
          await this.loadApplicantsForOffer(nextOffer.id);
        }
      }

      const message = result.message ?? 'Oferta eliminada correctamente.';
      this.offerActionMessage.set(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo eliminar la oferta.';
      this.offerActionError.set(message);
    } finally {
      this.deletingOffer.set(false);
    }
  }

  private async loadApplicantsForOffer(offerId: number): Promise<void> {
    if (!Number.isInteger(offerId) || offerId <= 0) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.applicants.set([]);

    try {
      const list = await firstValueFrom(this.companyService.listApplicantsForOffer(offerId));
      this.applicants.set(list);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo obtener la lista de postulantes.';
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  protected buildProfileUrl(applicant: CompanyApplicant): string | null {
    const slug = applicant.applicantProfileSlug?.trim();

    if (!slug) {
      return null;
    }

    const origin = this.document?.location?.origin ?? '';

    if (!origin) {
      return `/user/${slug}`;
    }

    try {
      return new URL(`/user/${slug}`, origin).toString();
    } catch {
      const normalizedOrigin = origin.replace(/\/$/, '');
      return `${normalizedOrigin}/user/${slug}`;
    }
  }

  protected openFormModal(applicant: CompanyApplicant): void {
    this.selectedApplicant.set(applicant);
    this.isFormModalOpen.set(true);
  }

  protected closeFormModal(): void {
    this.isFormModalOpen.set(false);
    this.selectedApplicant.set(null);
  }
}
