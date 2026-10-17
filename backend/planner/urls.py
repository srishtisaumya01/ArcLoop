from django.urls import path

from config.resources import ResourceView

from .resources import DayResource, OccurrenceResource, TemplateResource


def collection(resource_class):
    resource = resource_class()
    view = type(f'{resource_class.__name__}View', (ResourceView,), {'resource': resource})
    return path(f'{resource.name}/', view.as_view())


urlpatterns = [collection(TemplateResource), collection(DayResource), collection(OccurrenceResource)]
