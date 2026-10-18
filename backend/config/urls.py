from django.contrib import admin
from django.urls import include, path

from . import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/health/', views.HealthView.as_view()),
    path('api/v1/csp-report/', views.CspReportView.as_view()),
    path('api/v1/', include('accounts.urls')),
    path('api/v1/', include('planner.urls')),
    path('api/v1/', include('reminders.urls')),
]
