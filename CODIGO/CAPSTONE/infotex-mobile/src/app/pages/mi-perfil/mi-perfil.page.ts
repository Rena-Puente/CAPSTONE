import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonPage } from '@ionic/angular/standalone';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';

@Component({
  selector: 'app-mi-perfil',
  standalone: true,
  templateUrl: 'mi-perfil.page.html',
  styleUrls: ['mi-perfil.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonPage, ExploreContainerComponent],
})
export class MiPerfilPage {
  constructor() {}
}
