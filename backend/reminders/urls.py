from planner.urls import collection

from .resources import PreferenceResource, TaskReminderResource

urlpatterns = [collection(PreferenceResource), collection(TaskReminderResource)]
