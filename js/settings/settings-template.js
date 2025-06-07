// Settings Template - JavaScript version of the settings modal from index copy.html
// This template can be used to dynamically generate the settings interface

export const settingsTemplate = {
  // Main settings modal structure
  modal: {
    id: 'settings-modal',
    className: 'settings-modal',
    
    // Settings button to trigger modal
    trigger: {
      id: 'settings-btn',
      className: 'settings-btn',
      ariaLabel: '打开设置',
      svg: {
        width: 24,
        height: 24,
        viewBox: '0 0 24 24',
        fill: 'none',
        paths: [
          'M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z',
          'M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.258 9.77251 19.9887C9.5799 19.7194 9.31074 19.5143 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.3766 5.705 20.3766C5.44217 20.3766 5.18192 20.3248 4.93912 20.2241C4.69632 20.1235 4.47575 19.976 4.29 19.79C4.10405 19.6043 3.95653 19.3837 3.85588 19.1409C3.75523 18.8981 3.70343 18.6378 3.70343 18.375C3.70343 18.1122 3.75523 17.8519 3.85588 17.6091C3.95653 17.3663 4.10405 17.1457 4.29 16.96L4.35 16.9C4.58054 16.6643 4.73519 16.365 4.794 16.0406C4.85282 15.7162 4.81312 15.3816 4.68 15.08C4.55324 14.7842 4.34276 14.532 4.07447 14.3543C3.80618 14.1766 3.49179 14.0813 3.17 14.08H3C2.46957 14.08 1.96086 13.8693 1.58579 13.4942C1.21071 13.1191 1 12.6104 1 12.08C1 11.5496 1.21071 11.0409 1.58579 10.6658C1.96086 10.2907 2.46957 10.08 3 10.08H3.09C3.42099 10.0723 3.742 9.96512 4.0113 9.77251C4.28059 9.5799 4.48572 9.31074 4.6 9C4.73312 8.69838 4.77282 8.36381 4.714 8.03941C4.65519 7.71502 4.50054 7.41568 4.27 7.18L4.21 7.12C4.02405 6.93425 3.87653 6.71368 3.77588 6.47088C3.67523 6.22808 3.62343 5.96783 3.62343 5.705C3.62343 5.44217 3.67523 5.18192 3.77588 4.93912C3.87653 4.69632 4.02405 4.47575 4.21 4.29C4.39575 4.10405 4.61632 3.95653 4.85912 3.85588C5.10192 3.75523 5.36217 3.70343 5.625 3.70343C5.88783 3.70343 6.14808 3.75523 6.39088 3.85588C6.63368 3.95653 6.85425 4.10405 7.04 4.29L7.1 4.35C7.33568 4.58054 7.63502 4.73519 7.95941 4.794C8.28381 4.85282 8.61838 4.81312 8.92 4.68H9C9.29577 4.55324 9.54802 4.34276 9.72569 4.07447C9.90337 3.80618 9.99872 3.49179 10 3.17V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.72618 14.2743 3.99447C14.452 4.26276 14.7042 4.47324 15 4.6C15.3016 4.73312 15.6362 4.77282 15.9606 4.714C16.285 4.65519 16.5843 4.50054 16.82 4.27L16.88 4.21C17.0657 4.02405 17.2863 3.87653 17.5291 3.77588C17.7719 3.67523 18.0322 3.62343 18.295 3.62343C18.5578 3.62343 18.8181 3.67523 19.0609 3.77588C19.3037 3.87653 19.5243 4.02405 19.71 4.21C19.896 4.39575 20.0435 4.61632 20.1441 4.85912C20.2448 5.10192 20.2966 5.36217 20.2966 5.625C20.2966 5.88783 20.2448 6.14808 20.1441 6.39088C20.0435 6.63368 19.896 6.85425 19.71 7.04L19.65 7.1C19.4195 7.33568 19.2648 7.63502 19.206 7.95941C19.1472 8.28381 19.1869 8.61838 19.32 8.92V9C19.4468 9.29577 19.6572 9.54802 19.9255 9.72569C20.1938 9.90337 20.5082 9.99872 20.83 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.91C20.5882 14.0013 20.2738 14.0966 20.0055 14.2743C19.7372 14.452 19.5268 14.7042 19.4 15Z'
        ]
      }
    },

    // Modal content structure
    content: {
      className: 'settings-content',
      
      header: {
        className: 'settings-header',
        title: 'Settings',
        closeButton: {
          id: 'close-settings',
          className: 'close-btn',
          text: '×'
        }
      },

      body: {
        className: 'settings-body',
        form: {
          id: 'settings-form',
          autocomplete: 'off',
          
          // Settings groups configuration
          groups: [
            // Model Settings Group
            {
              title: 'Model Settings',
              className: 'setting-group',
              items: [
                {
                  type: 'select',
                  id: 'model-type',
                  label: 'Model Type',
                  className: 'setting-item',
                  options: [
                    { value: 'gemini-2.0-flash-exp', text: 'gemini-2.0-flash-exp' },
                    { value: 'gemini-2.0-flash-live-001', text: 'gemini-2.0-flash-live-001' }
                  ]
                },
                {
                  type: 'password',
                  id: 'api-key',
                  label: 'API Key',
                  className: 'setting-item',
                  placeholder: 'Enter your API key',
                  autocomplete: 'new-password'
                }

              ]
            },

            // Model Parameters Group
            {
              title: 'Model Parameters',
              className: 'setting-group',
              items: [
                {
                  type: 'range',
                  id: 'temperature',
                  label: 'Temperature',
                  className: 'setting-item',
                  min: 0,
                  max: 2,
                  step: 0.1,
                  value: 1.8,
                  showValue: true
                },
                {
                  type: 'number',
                  id: 'max-tokens',
                  label: 'Max Tokens',
                  className: 'setting-item',
                  value: 512,
                  min: 1,
                  max: 4096
                },
                {
                  type: 'range',
                  id: 'top-p',
                  label: 'Top P(0~1)',
                  className: 'setting-item',
                  min: 0,
                  max: 1,
                  step: 0.01,
                  value: 0.9,
                  showValue: true
                },
                {
                  type: 'number',
                  id: 'top-k',
                  label: 'Top K(1~100)',
                  className: 'setting-item',
                  value: 40,
                  min: 1,
                  max: 100
                }
              ]
            },

            // Voice Settings Group
            {
              title: 'Voice Settings',
              className: 'setting-group',
              items: [
                {
                  type: 'select',
                  id: 'sample-rate',
                  label: 'Sample Rate',
                  className: 'setting-item',
                  options: [
                    { value: '16000', text: '16 kHz' },
                    { value: '24000', text: '24 kHz' },
                    { value: '44100', text: '44.1 kHz' },
                    { value: '48000', text: '48 kHz' }
                  ]
                },
                {
                  type: 'select',
                  id: 'voice-type',
                  label: 'AI Voice',
                  className: 'setting-item',
                  options: [
                    { value: 'Aoede', text: 'Aoede' },
                    { value: 'Puck', text: 'Puck' },
                    { value: 'Charon', text: 'Charon' },
                    { value: 'Kore', text: 'Kore' },
                    { value: 'Fenrir', text: 'Fenrir' },
                    { value: 'Leda', text: 'Leda' },
                    { value: 'Orus', text: 'Orus' },
                    { value: 'Zephyr', text: 'Zephyr' }
                  ]
                },
                {
                  type: 'speed-options',
                  id: 'voice-speed',
                  label: 'Voice Speed',
                  className: 'setting-item',
                  options: [
                    { speed: 0.8, text: '0.8x' },
                    { speed: 1.0, text: '1.0x' },
                    { speed: 1.2, text: '1.2x' },
                    { speed: 1.5, text: '1.5x' },
                    { speed: 2, text: '2x' }
                  ]
                }
              ]
            },

            // System Instructions Group
            {
              title: 'System Instructions',
              className: 'setting-group',
              items: [
                {
                  type: 'textarea',
                  id: 'system-instructions',
                  label: 'AI Instructions',
                  className: 'setting-item',
                  rows: 4,
                  placeholder: 'Instructions for the AI',
                  defaultValue: 'You are a helpful English tutor. Help the user practice English conversation.'
                }
              ]
            }
          ]
        }
      },

      footer: {
        className: 'settings-footer',
        saveButton: {
          id: 'save-settings',
          className: 'save-btn',
          text: 'Save Settings'
        }
      }
    }
  },

  // Default values for all settings
  defaults: {
    modelType: 'gemini-2.0-flash-exp',
    apiKey: '',
    chatApiProxyUrl: '',
    temperature: 1.8,
    maxTokens: 512,
    topP: 0.9,
    topK: 40,
    sampleRate: '16000',
    voiceType: 'Aoede',
    voiceSpeed: 1.0,
    systemInstructions: 'You are a helpful English tutor. Help the user practice English conversation.'
  },

  // Validation rules
  validation: {
    apiKey: {
      required: true,
      minLength: 10,
      message: 'API Key is required and must be at least 10 characters long'
    },
    temperature: {
      min: 0,
      max: 2,
      message: 'Temperature must be between 0 and 2'
    },
    maxTokens: {
      min: 1,
      max: 4096,
      message: 'Max Tokens must be between 1 and 4096'
    },
    topP: {
      min: 0,
      max: 1,
      message: 'Top P must be between 0 and 1'
    },
    topK: {
      min: 1,
      max: 100,
      message: 'Top K must be between 1 and 100'
    }
  }
};

// Helper function to generate HTML from template
export function generateSettingsHTML(template = settingsTemplate) {
  const { modal } = template;
  
  // Don't generate settings button since it already exists in HTML
  // This was causing click interception issues

  // Generate form items
  const generateFormItem = (item) => {
    switch (item.type) {
      case 'select':
        return `
          <div class="${item.className}">
            <label for="${item.id}">${item.label}</label>
            <select id="${item.id}" ${item.name ? `name="${item.name}"` : ''}>
              ${item.options.map(option => `<option value="${option.value}">${option.text}</option>`).join('')}
            </select>
            ${item.note ? `<span class="input-note">${item.note}</span>` : ''}
          </div>
        `;
      
      case 'password':
      case 'text':
        return `
          <div class="${item.className}">
            <label for="${item.id}">${item.label}</label>
            <input type="${item.type}" id="${item.id}" 
                   ${item.name ? `name="${item.name}"` : ''}
                   ${item.placeholder ? `placeholder="${item.placeholder}"` : ''}
                   ${item.autocomplete ? `autocomplete="${item.autocomplete}"` : ''}>
            ${item.note ? `<span class="input-note">${item.note}</span>` : ''}
          </div>
        `;
      
      case 'number':
        return `
          <div class="${item.className}">
            <label for="${item.id}">${item.label}</label>
            <input type="number" id="${item.id}" 
                   value="${item.value}" 
                   min="${item.min}" 
                   max="${item.max}">
          </div>
        `;
      
      case 'range':
        return `
          <div class="${item.className}">
            <label for="${item.id}">${item.label}</label>
            <input type="range" id="${item.id}" 
                   min="${item.min}" 
                   max="${item.max}" 
                   step="${item.step}" 
                   value="${item.value}">
            ${item.showValue ? `<span class="value-display">${item.value}</span>` : ''}
          </div>
        `;
      
      case 'speed-options':
        return `
          <div class="${item.className}">
            <label for="${item.id}">${item.label}</label>
            <div class="speed-options">
              ${item.options.map(option => `<div class="speed-option" data-speed="${option.speed}">${option.text}</div>`).join('')}
            </div>
          </div>
        `;
      
      case 'textarea':
        return `
          <div class="${item.className}">
            <label for="${item.id}">${item.label}</label>
            <textarea id="${item.id}" 
                      rows="${item.rows}" 
                      placeholder="${item.placeholder}">${item.defaultValue || ''}</textarea>
          </div>
        `;
      
      default:
        return '';
    }
  };

  // Generate groups
  const groups = modal.content.body.form.groups.map(group => `
    <div class="${group.className}">
      <h3>${group.title}</h3>
      ${group.items.map(generateFormItem).join('')}
    </div>
  `).join('');

  // Generate complete modal
  const modalHTML = `
    <div class="${modal.className}" id="${modal.id}">
      <div class="${modal.content.className}">
        <div class="${modal.content.header.className}">
          <h2>${modal.content.header.title}</h2>
          <button class="${modal.content.header.closeButton.className}" 
                  id="${modal.content.header.closeButton.id}">
            ${modal.content.header.closeButton.text}
          </button>
        </div>
        <div class="${modal.content.body.className}">
          <form id="${modal.content.body.form.id}" 
                autocomplete="${modal.content.body.form.autocomplete}">
            ${groups}
          </form>
        </div>
        <div class="${modal.content.footer.className}">
          <button class="${modal.content.footer.saveButton.className}" 
                  id="${modal.content.footer.saveButton.id}">
            ${modal.content.footer.saveButton.text}
          </button>
        </div>
      </div>
    </div>
  `;

  return modalHTML;
}

// Export default
export default settingsTemplate;
