import modal from '../utils/modal';
import persistence from '../utils/persistence';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import stashes from '../utils/_stashes';

export default modal.ModalController.extend({
  opening: function() {
    this.set('loading', false);
    this.set('error', false);
    var end = (new Date()).getTime() + 5000;
    var _this = this;
    var canceled = false;
    if(this.get('model.reply_id')) {
      app_state.set('reply_note', null);
    }
    this.set('cancel', function() {
      canceled = true;
    })
    var again = function() {
      var now = (new Date()).getTime();
      var diff = Math.round((end - now) / 1000);
      if(diff < 0) {
        diff = 0;
        _this.send('confirm');
      } else if(!canceled) {
        setTimeout(again, 200);
      }
      _this.set('seconds', diff)
    };
    setTimeout(again, 200);
  },
  closing: function() {
    if(this.get('cancel')) {
      this.get('cancel')();
    }
  },
  actions: {
    confirm: function() {
      if(this.get('cancel')) {
        this.get('cancel')();
      }
      var _this = this;
      _this.set('loading', true);
      if(app_state.get('referenced_user')) {
        app_state.set('referenced_user.last_share', (new Date()).getTime());
      }
      var fallback = function() {
        if(_this.get('model.raw')) {
          stashes.log_event({
            share: true,
            utterance: _this.get('model.raw'),
            message_uid: Math.random() + ":" + (new Date()).getTime(),
            sentence: _this.get('model.sentence'),
            recipient_id: _this.get('model.user.id'),
            reply_id: _this.get('model.reply_id')
          }, app_state.get('referenced_user.id'));
          modal.close('confirm-notify-user');
          if(persistence.get('online')) {
            stashes.push_log();
            modal.success(i18n.t('user_notified', "Message will be sent with logs or next sync."));
          } else {
            modal.success(i18n.t('user_notified', "Message queued to be sent when online."));
          }
        } else {
          this.set('error', true);
        }
      };
      if(!this.get('model.utterance') && this.get('model.raw')) {
        fallback();
      } else {
        persistence.ajax('/api/v1/utterances/' + this.get('model.utterance.id') + '/share', {
          type: 'POST',
          data: {
            sharer_id: _this.get('model.sharer_id') || app_state.get('referenced_user.id'),
            user_id: _this.get('model.user.id'),
            reply_id: _this.get('model.reply_id')
          }
        }).then(function(data) {
          _this.set('loading', false);
          modal.close('confirm-notify-user');
          modal.success(i18n.t('user_notified', "Message sent!"));
        }, function(err) {
          _this.set('loading', false);
          if(err && err.result && err.result.status >= 400) {
            _this.set('error', true);
          } else {
            fallback();
          }
        });
      }
    }
  }
});
