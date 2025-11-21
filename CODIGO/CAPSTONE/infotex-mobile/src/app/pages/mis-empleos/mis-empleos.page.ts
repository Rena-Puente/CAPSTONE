import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular/standalone';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';

@Component({
  selector: 'app-mis-empleos',
  standalone: true,
  templateUrl: 'mis-empleos.page.html',
  styleUrls: ['mis-empleos.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, ExploreContainerComponent]
})
export class MisEmpleosPage {

  constructor() {}

}
