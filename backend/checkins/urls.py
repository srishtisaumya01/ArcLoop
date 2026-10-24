from django.urls import path

from . import views

urlpatterns = [
    path('checkin/', views.CheckinView.as_view()),
    path('checkin/start/', views.CheckInView.as_view()),
    path('checkin/end/', views.CheckOutView.as_view()),
    path('cron/streak-reminders/', views.CronStreakRemindersView.as_view()),
    path('email/unsubscribe/', views.unsubscribe),
]
