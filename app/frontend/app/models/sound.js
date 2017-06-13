import Ember from 'ember';
import DS from 'ember-data';
import CoughDrop from '../app';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';

CoughDrop.Sound = DS.Model.extend({
  didLoad: function() {
    this.checkForDataURL().then(null, function() { });
    this.clean_license();
    this.check_transcription();
  },
  user_id: DS.attr('string'),
  url: DS.attr('string'),
  created: DS.attr('date'),
  content_type: DS.attr('string'),
  name: DS.attr('string'),
  tags: DS.attr('raw'),
  tag: DS.attr('string'),
  transcription: DS.attr('string'),
  duration: DS.attr('number'),
  pending: DS.attr('boolean'),
  protected: DS.attr('boolean'),
  license: DS.attr('raw'),
  permissions: DS.attr('raw'),
  file: DS.attr('boolean'),
  untranscribable: DS.attr('boolean'),
  search_string: function() {
    return this.get('name') + " " + this.get('transcription') + " " + this.get('created');
  }.property('name', 'transcription', 'created'),
  check_transcription: function() {
    if(this.get('transcription')) {
      this.set('transcription_pending', false);
      return true;
    } else if(this.get('untranscribable')) {
      this.set('transcription_pending', false);
      return false;
    } else {
      var two_hours_ago = window.moment().add(-2, 'hours');
      var created = window.moment(this.get('created'));
      if(created > two_hours_ago) {
        var _this = this;
        this.set('transcription_pending', true);

        var timeout = 5 * 1000;
        var attempts = (this.get('transcription_checks') || 0);
        if(attempts == 1) {
          timeout = 10 * 1000;
        } else if(attempts < 4) {
          timeout = 15 * 1000;
        } else {
          timeout = 60 * 1000;
        }
        this.set('transcription_checks', attempts + 1);
        Ember.run.later(function() {
          if(persistence.get('online')) {
            _this.reload().then(function(res) {
              _this.check_transcription();
            }, function(err) {
              Ember.run.later(function() {
                _this.check_transcription();
              }, 2 * 60 * 1000);
            });
          } else {
            Ember.run.later(function() {
              _this.check_transcription();
            }, 2 * 60 * 1000);
          }
        }, timeout);
      } else {
        this.set('transcription_pending', false);
      }
    }
  },
  filename: function() {
    var url = this.get('url') || '';
    if(url.match(/^data/)) {
      return i18n.t('embedded_sound', "embedded sound");
    } else {
      var paths = url.split(/\?/)[0].split(/\//);
      var name = paths[paths.length - 1];
      if(!name.match(/\.(mp3|wav|aac|ogg)$/)) {
        name = null;
      }
      return decodeURIComponent(name || 'sound');
    }
  }.property('url'),
  check_for_editable_license: function() {
    if(this.get('license') && this.get('id') && !this.get('permissions.edit')) {
      this.set('license.uneditable', true);
    }
  }.observes('license', 'id'),
  clean_license: function() {
    var _this = this;
    ['copyright_notice', 'source', 'author'].forEach(function(key) {
      if(_this.get('license.' + key + '_link')) {
        _this.set('license.' + key + '_url', _this.get('license.' + key + '_url') || _this.get('license.' + key + '_link'));
      }
      if(_this.get('license.' + key + '_link')) {
        _this.set('license.' + key + '_link', _this.get('license.' + key + '_link') || _this.get('license.' + key + '_url'));
      }
    });
  },
  best_url: function() {
    return this.get('data_url') || this.get('url');
  }.property('url', 'data_url'),
  checkForDataURL: function() {
    this.set('checked_for_data_url', true);
    var _this = this;
    if(!this.get('data_url') && this.get('url') && this.get('url').match(/^http/) && !persistence.online) {
      return persistence.find_url(this.get('url'), 'sound').then(function(data_uri) {
        _this.set('data_url', data_uri);
        return _this;
      });
    } else if(this.get('url') && this.get('url').match(/^data/)) {
      return Ember.RSVP.resolve(this);
    }
    return Ember.RSVP.reject('no sound data url');
  },
  checkForDataURLOnChange: function() {
    this.checkForDataURL().then(null, function() { });
  }.observes('url')
});
CoughDrop.Sound.reopenClass({
  mimic_server_processing: function(record, hash) {
    if(record.get('data_url')) {
      hash.sound.url = record.get('data_url');
      hash.sound.data_url = hash.sound.url;
    }
    return hash;
  }
});

export default CoughDrop.Sound;
